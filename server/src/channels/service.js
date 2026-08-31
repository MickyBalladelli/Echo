import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'
import { notifyChannelInvite, notifyChannelJoin, notifyChannelPost } from '../notifications/service.js'
import { getPostById, listPosts } from '../posts/service.js'

function mapChannel(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.image_url || null,
    rules: row.rules || '',
    pinnedPostId: row.pinned_post_id || null,
    postApprovalRequired: Boolean(row.post_approval_required),
    visibility: row.visibility,
    createdAt: row.created_at,
    owner: {
      id: row.owner_id,
      username: row.owner_username,
      displayName: row.owner_display_name || row.owner_username
    },
    memberCount: Number(row.member_count),
    postCount: Number(row.post_count),
    membershipRole: row.membership_role || null,
    invited: Boolean(row.invited),
    isOwner: row.owner_id === row.viewer_id,
    canModerate: row.membership_role === 'owner' || row.membership_role === 'moderator',
    muted: Boolean(row.membership_muted_until && new Date(row.membership_muted_until) > new Date()),
    notificationsEnabled: row.membership_notifications_enabled !== false
  }
}

const channelSelect = `
  SELECT c.*, owner.username AS owner_username, owner_profile.display_name AS owner_display_name,
    :viewerId::uuid AS viewer_id,
    viewer_membership.role AS membership_role,
    viewer_membership.muted_until AS membership_muted_until,
    viewer_membership.notifications_enabled AS membership_notifications_enabled,
    EXISTS (
      SELECT 1 FROM channel_invites invitation
      WHERE invitation.channel_id = c.id AND invitation.user_id = :viewerId AND invitation.accepted_at IS NULL
    ) AS invited,
    COUNT(DISTINCT members.user_id)::INTEGER AS member_count,
    COUNT(DISTINCT posts.id)::INTEGER AS post_count
  FROM channels c
  JOIN users owner ON owner.id = c.owner_id AND owner.deleted_at IS NULL AND owner.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks owner_block
      WHERE (owner_block.blocker_id = :viewerId AND owner_block.blocked_id = owner.id)
         OR (owner_block.blocker_id = owner.id AND owner_block.blocked_id = :viewerId)
    )
  LEFT JOIN profiles owner_profile ON owner_profile.user_id = owner.id
  LEFT JOIN channel_members viewer_membership ON viewer_membership.channel_id = c.id
    AND viewer_membership.user_id = :viewerId AND viewer_membership.left_at IS NULL
  LEFT JOIN channel_members members ON members.channel_id = c.id AND members.left_at IS NULL
  LEFT JOIN posts ON posts.channel_id = c.id
    AND posts.deleted_at IS NULL
    AND posts.channel_moderation_status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks channel_block
      WHERE (channel_block.blocker_id = :viewerId AND channel_block.blocked_id = posts.author_id)
         OR (channel_block.blocker_id = posts.author_id AND channel_block.blocked_id = :viewerId)
    )
`

async function getChannelRow(viewerId, slug, transaction, { requireMember = false } = {}) {
  const rows = await sequelize.query(`
    ${channelSelect}
    WHERE c.slug = :slug AND c.deleted_at IS NULL
      AND (${requireMember ? 'viewer_membership.user_id IS NOT NULL' : `
        c.visibility = 'public' OR viewer_membership.user_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM channel_invites access_invite
          WHERE access_invite.channel_id = c.id AND access_invite.user_id = :viewerId
            AND access_invite.accepted_at IS NULL
        )
      `})
    GROUP BY c.id, owner.id, owner_profile.user_id, viewer_membership.channel_id,
      viewer_membership.user_id, viewer_membership.role, viewer_membership.muted_until,
      viewer_membership.notifications_enabled
    LIMIT 1
  `, {
    replacements: { viewerId, slug },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  if (!rows[0]) throw new HttpError(404, 'CHANNEL_NOT_FOUND', 'Channel not found')
  return rows[0]
}

export async function listChannels(viewerId, { cursor, limit }) {
  const where = [`c.deleted_at IS NULL`, `(
    c.visibility = 'public' OR viewer_membership.user_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM channel_invites access_invite
      WHERE access_invite.channel_id = c.id AND access_invite.user_id = :viewerId
        AND access_invite.accepted_at IS NULL
    )
  )`]
  const replacements = { viewerId }
  if (cursor) {
    if (cursor.score !== null && cursor.score !== undefined) {
      where.push('(c.discovery_score, c.created_at, c.id) < (CAST(:cursorScore AS numeric), CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
      replacements.cursorScore = cursor.score
    } else {
      where.push('(c.created_at, c.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    }
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }
  const rows = await sequelize.query(`
    ${channelSelect}
    WHERE ${where.join(' AND ')}
    GROUP BY c.id, owner.id, owner_profile.user_id, viewer_membership.channel_id,
      viewer_membership.user_id, viewer_membership.role, viewer_membership.muted_until,
      viewer_membership.notifications_enabled
    ORDER BY c.discovery_score DESC, c.created_at DESC, c.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)
  return {
    channels: page.map(mapChannel),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id, score: last.discovery_score }) : null
  }
}

export async function getChannel(viewerId, slug) {
  const row = await getChannelRow(viewerId, slug)
  const channel = mapChannel(row)
  if (row.pinned_post_id) {
    try {
      channel.pinnedPost = await getPostById(viewerId, row.pinned_post_id)
    } catch (error) {
      if (error.code !== 'POST_NOT_FOUND') throw error
    }
  }
  return channel
}

function slugFromName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function notifyChannelMembers(channelId, authorId, postId, transaction) {
  const recipients = await sequelize.query(`
    SELECT member.user_id
    FROM channel_members member
    WHERE member.channel_id = :channelId
      AND member.user_id <> :authorId
      AND member.left_at IS NULL
      AND member.notifications_enabled = TRUE
      AND (member.muted_until IS NULL OR member.muted_until < CURRENT_TIMESTAMP)
  `, {
    replacements: { channelId, authorId },
    type: QueryTypes.SELECT,
    transaction
  })
  for (const recipient of recipients) {
    await notifyChannelPost({
      recipientId: recipient.user_id,
      actorId: authorId,
      channelId,
      postId
    }, transaction)
  }
}

async function channelNotificationsEnabled(userId, channelId, transaction) {
  const rows = await sequelize.query(`
    SELECT notifications_enabled, muted_until
    FROM channel_members
    WHERE channel_id = :channelId AND user_id = :userId AND left_at IS NULL
    LIMIT 1
  `, {
    replacements: { channelId, userId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  if (!rows[0]) return true
  return rows[0].notifications_enabled !== false &&
    (!rows[0].muted_until || new Date(rows[0].muted_until) < new Date())
}

async function requireChannelModerator(userId, channelId, transaction) {
  const rows = await sequelize.query(`
    SELECT channel.id, channel.owner_id, member.role
    FROM channels channel
    JOIN channel_members member ON member.channel_id = channel.id
      AND member.user_id = :userId AND member.left_at IS NULL
    WHERE channel.id = :channelId AND channel.deleted_at IS NULL
      AND member.role IN ('owner', 'moderator')
    LIMIT 1
  `, {
    replacements: { userId, channelId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  if (!rows[0]) throw new HttpError(403, 'CHANNEL_MODERATOR_REQUIRED', 'Channel moderator required')
  return rows[0]
}

export async function createChannel(ownerId, input) {
  const slug = input.slug || slugFromName(input.name)
  if (slug.length < 2) throw new HttpError(400, 'INVALID_CHANNEL_SLUG', 'Channel name needs more letters')
  try {
    await withTransaction(async transaction => {
      const rows = await sequelize.query(`
        INSERT INTO channels (
          owner_id, name, slug, description, image_url, visibility, rules, post_approval_required
        )
        VALUES (
          :ownerId, :name, :slug, :description, :imageUrl, :visibility, :rules, :postApprovalRequired
        )
        RETURNING id
      `, {
        replacements: {
          ownerId,
          slug,
          ...input,
          imageUrl: input.imageUrl || null,
          rules: input.rules || '',
          postApprovalRequired: Boolean(input.postApprovalRequired)
        },
        type: QueryTypes.SELECT,
        transaction
      })
      await sequelize.query(`
        INSERT INTO channel_members (channel_id, user_id, role)
        VALUES (:channelId, :ownerId, 'owner')
      `, { replacements: { channelId: rows[0].id, ownerId }, transaction })
    })
  } catch (error) {
    if (error?.original?.code === '23505') throw new HttpError(409, 'CHANNEL_SLUG_TAKEN', 'Channel slug already exists')
    throw error
  }
  return getChannel(ownerId, slug)
}

export async function updateChannel(ownerId, slug, input) {
  const current = await getChannelRow(ownerId, slug, undefined, { requireMember: true })
  if (current.owner_id !== ownerId) throw new HttpError(403, 'CHANNEL_OWNER_REQUIRED', 'Channel owner required')
  const nextSlug = input.slug || current.slug
  try {
    await sequelize.query(`
      UPDATE channels SET
        name = COALESCE(:name, name), slug = :nextSlug,
        description = COALESCE(:description, description),
        rules = CASE WHEN :hasRules THEN :rules ELSE rules END,
        image_url = CASE WHEN :hasImageUrl THEN :imageUrl ELSE image_url END,
        visibility = COALESCE(:visibility, visibility),
        post_approval_required = CASE WHEN :hasPostApprovalRequired THEN :postApprovalRequired ELSE post_approval_required END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = :channelId
    `, {
      replacements: {
        channelId: current.id,
        name: input.name || null,
        nextSlug,
        description: input.description ?? null,
        hasRules: Object.hasOwn(input, 'rules'),
        rules: input.rules ?? null,
        hasImageUrl: Object.hasOwn(input, 'imageUrl'),
        imageUrl: input.imageUrl ?? null,
        visibility: input.visibility || null,
        hasPostApprovalRequired: Object.hasOwn(input, 'postApprovalRequired'),
        postApprovalRequired: input.postApprovalRequired ?? null
      }
    })
  } catch (error) {
    if (error?.original?.code === '23505') throw new HttpError(409, 'CHANNEL_SLUG_TAKEN', 'Channel slug already exists')
    throw error
  }
  return getChannel(ownerId, nextSlug)
}

export async function joinChannel(userId, slug) {
  return withTransaction(async transaction => {
    const channel = await getChannelRow(userId, slug, transaction)
    if (channel.visibility === 'private' && !channel.invited && channel.owner_id !== userId) {
      throw new HttpError(403, 'CHANNEL_INVITE_REQUIRED', 'Private channel invite required')
    }
    const existingMembership = await sequelize.query(`
      SELECT 1 FROM channel_members
      WHERE channel_id = :channelId AND user_id = :userId AND left_at IS NULL
      LIMIT 1
    `, { replacements: { channelId: channel.id, userId }, type: QueryTypes.SELECT, transaction })
    await sequelize.query(`
      INSERT INTO channel_members (channel_id, user_id, role, joined_at, left_at)
      VALUES (:channelId, :userId, 'member', CURRENT_TIMESTAMP, NULL)
      ON CONFLICT (channel_id, user_id) DO UPDATE SET joined_at = CURRENT_TIMESTAMP, left_at = NULL
    `, { replacements: { channelId: channel.id, userId }, transaction })
    if (!existingMembership[0]) {
      await sequelize.query(`
        UPDATE channels SET discovery_score = discovery_score + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = :channelId
      `, { replacements: { channelId: channel.id }, transaction })
    }
    await sequelize.query(`
      UPDATE channel_invites SET accepted_at = CURRENT_TIMESTAMP
      WHERE channel_id = :channelId AND user_id = :userId
    `, { replacements: { channelId: channel.id, userId }, transaction })
    if (await channelNotificationsEnabled(channel.owner_id, channel.id, transaction)) {
      await notifyChannelJoin({ recipientId: channel.owner_id, actorId: userId, channelId: channel.id }, transaction)
    }
    return mapChannel(await getChannelRow(userId, slug, transaction))
  })
}

export async function leaveChannel(userId, slug) {
  return withTransaction(async transaction => {
    const channel = await getChannelRow(userId, slug, transaction, { requireMember: true })
    if (channel.owner_id === userId) throw new HttpError(400, 'OWNER_CANNOT_LEAVE', 'Owner cannot leave their channel')
    await sequelize.query(`
      UPDATE channel_members SET left_at = CURRENT_TIMESTAMP
      WHERE channel_id = :channelId AND user_id = :userId AND left_at IS NULL
    `, { replacements: { channelId: channel.id, userId }, transaction })
    await sequelize.query(`
      UPDATE channels SET discovery_score = GREATEST(0, discovery_score - 1), updated_at = CURRENT_TIMESTAMP
      WHERE id = :channelId
    `, { replacements: { channelId: channel.id }, transaction })
    return { channelId: channel.id, joined: false }
  })
}

export async function listChannelMembers(viewerId, slug) {
  const channel = await getChannelRow(viewerId, slug)
  const rows = await sequelize.query(`
    SELECT u.id, u.username, profile.display_name, profile.avatar_url, member.role, member.joined_at
    FROM channel_members member
    JOIN users u ON u.id = member.user_id AND u.deleted_at IS NULL AND u.status = 'active'
    LEFT JOIN profiles profile ON profile.user_id = u.id
    WHERE member.channel_id = :channelId AND member.left_at IS NULL
    ORDER BY CASE member.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
      member.joined_at ASC
    LIMIT 200
  `, { replacements: { channelId: channel.id }, type: QueryTypes.SELECT })
  return rows.map(row => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    joinedAt: row.joined_at
  }))
}

export async function inviteToChannel(ownerId, slug, username) {
  return withTransaction(async transaction => {
    const channel = await getChannelRow(ownerId, slug, transaction, { requireMember: true })
    if (channel.owner_id !== ownerId) throw new HttpError(403, 'CHANNEL_OWNER_REQUIRED', 'Channel owner required')
    const users = await sequelize.query(`
      SELECT id FROM users WHERE LOWER(username) = LOWER(:username)
        AND deleted_at IS NULL AND status = 'active' LIMIT 1
    `, { replacements: { username }, type: QueryTypes.SELECT, transaction })
    const target = users[0]
    if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found')
    if (target.id === ownerId) throw new HttpError(400, 'INVALID_CHANNEL_INVITE', 'Owner is already a member')
    await sequelize.query(`
      INSERT INTO channel_invites (channel_id, user_id, invited_by, accepted_at)
      VALUES (:channelId, :userId, :ownerId, NULL)
      ON CONFLICT (channel_id, user_id) DO UPDATE SET invited_by = :ownerId, created_at = CURRENT_TIMESTAMP,
        accepted_at = NULL
    `, { replacements: { channelId: channel.id, userId: target.id, ownerId }, transaction })
    await notifyChannelInvite({ recipientId: target.id, actorId: ownerId, channelId: channel.id }, transaction)
    return { channelId: channel.id, userId: target.id, invited: true }
  })
}

export async function updateMemberRole(ownerId, slug, userId, role) {
  const channel = await getChannelRow(ownerId, slug, undefined, { requireMember: true })
  if (channel.owner_id !== ownerId) throw new HttpError(403, 'CHANNEL_OWNER_REQUIRED', 'Channel owner required')
  if (userId === ownerId) throw new HttpError(400, 'OWNER_ROLE_FIXED', 'Owner role cannot change')
  const rows = await sequelize.query(`
    UPDATE channel_members SET role = :role
    WHERE channel_id = :channelId AND user_id = :userId AND left_at IS NULL
    RETURNING user_id
  `, { replacements: { channelId: channel.id, userId, role }, type: QueryTypes.SELECT })
  if (!rows[0]) throw new HttpError(404, 'CHANNEL_MEMBER_NOT_FOUND', 'Channel member not found')
  return { userId, role }
}

export async function updateChannelPreferences(userId, slug, input) {
  const channel = await getChannelRow(userId, slug, undefined, { requireMember: true })
  await sequelize.query(`
    UPDATE channel_members
    SET muted_until = :mutedUntil,
        notifications_enabled = :notificationsEnabled
    WHERE channel_id = :channelId AND user_id = :userId AND left_at IS NULL
  `, {
    replacements: {
      channelId: channel.id,
      userId,
      mutedUntil: input.muted ? new Date('9999-12-31T23:59:59.000Z') : null,
      notificationsEnabled: input.notificationsEnabled
    }
  })
  return getChannel(userId, slug)
}

export async function moderateChannelPost(userId, slug, postId, status) {
  return withTransaction(async transaction => {
    const channel = await getChannelRow(userId, slug, transaction, { requireMember: true })
    await requireChannelModerator(userId, channel.id, transaction)
    const rows = await sequelize.query(`
      SELECT id, author_id, channel_moderation_status
      FROM posts
      WHERE id = :postId AND channel_id = :channelId AND deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: { postId, channelId: channel.id },
      type: QueryTypes.SELECT,
      transaction
    })
    const post = rows[0]
    if (!post) throw new HttpError(404, 'CHANNEL_POST_NOT_FOUND', 'Channel post not found')

    if (post.channel_moderation_status !== status) {
      await sequelize.query(`
        UPDATE posts
        SET channel_moderation_status = :status,
            channel_moderated_by = :userId,
            channel_moderated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :postId
      `, { replacements: { status, userId, postId }, transaction })
      if (post.channel_moderation_status === 'approved' && status !== 'approved') {
        await sequelize.query(`
          UPDATE channels
          SET discovery_score = GREATEST(0, discovery_score - 2),
              pinned_post_id = CASE WHEN pinned_post_id = :postId THEN NULL ELSE pinned_post_id END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = :channelId
        `, { replacements: { channelId: channel.id, postId: post.id }, transaction })
      } else if (post.channel_moderation_status !== 'approved' && status === 'approved') {
        await sequelize.query(`
          UPDATE channels SET discovery_score = discovery_score + 2, updated_at = CURRENT_TIMESTAMP
          WHERE id = :channelId
        `, { replacements: { channelId: channel.id }, transaction })
        await notifyChannelMembers(channel.id, post.author_id, post.id, transaction)
      }
      if (status !== 'approved' && post.channel_moderation_status !== 'approved') {
        await sequelize.query(`
          UPDATE channels
          SET pinned_post_id = CASE WHEN pinned_post_id = :postId THEN NULL ELSE pinned_post_id END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = :channelId
        `, { replacements: { channelId: channel.id, postId: post.id }, transaction })
      }
    }

    return getPostById(userId, post.id, transaction)
  })
}

export async function setPinnedPost(userId, slug, postId) {
  const channel = await getChannelRow(userId, slug, undefined, { requireMember: true })
  await requireChannelModerator(userId, channel.id)
  if (postId) {
    const rows = await sequelize.query(`
      SELECT id FROM posts
      WHERE id = :postId AND channel_id = :channelId
        AND deleted_at IS NULL AND visibility = 'public' AND channel_moderation_status = 'approved'
      LIMIT 1
    `, { replacements: { postId, channelId: channel.id }, type: QueryTypes.SELECT })
    if (!rows[0]) throw new HttpError(400, 'PINNED_CHANNEL_POST_INVALID', 'Only approved posts from this channel can be pinned')
  }
  await sequelize.query(`
    UPDATE channels
    SET pinned_post_id = :postId, updated_at = CURRENT_TIMESTAMP
    WHERE id = :channelId
  `, { replacements: { channelId: channel.id, postId: postId || null } })
  return getChannel(userId, slug)
}

export async function listChannelPosts(viewerId, slug, options) {
  const channel = await getChannelRow(viewerId, slug)
  return listPosts(viewerId, { ...options, channelId: channel.id })
}
