import { QueryTypes } from 'sequelize'
import { profiledQuery, sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'
import { notifyChannelPost, notifyLike, notifyReply } from '../notifications/service.js'
import { inspectContent } from '../moderation/signals.js'
import { cacheGet, cacheKey, cacheSet } from '../cache/memory.js'

export const MAX_REPLY_DEPTH = 3
const MAX_THREAD_REPLIES = 500
export const POST_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000
const channelAccess = alias => `(
  ${alias}.channel_id IS NULL OR EXISTS (
    SELECT 1 FROM channels access_channel
    LEFT JOIN channel_members access_member ON access_member.channel_id = access_channel.id
      AND access_member.user_id = :viewerId AND access_member.left_at IS NULL
    WHERE access_channel.id = ${alias}.channel_id
      AND access_channel.deleted_at IS NULL
      AND (access_channel.visibility = 'public' OR access_member.user_id IS NOT NULL)
  )
)`
const postVisibilityAccess = alias => `(
  (
    ${alias}.visibility = 'public'
    OR (${alias}.visibility = 'followers' AND (
      ${alias}.author_id = :viewerId OR EXISTS (
        SELECT 1 FROM follows visibility_follow
        WHERE visibility_follow.follower_id = :viewerId
          AND visibility_follow.following_id = ${alias}.author_id
      )
    ))
    OR (${alias}.visibility = 'private' AND ${alias}.author_id = :viewerId)
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_blocks visibility_block
    WHERE (visibility_block.blocker_id = :viewerId AND visibility_block.blocked_id = ${alias}.author_id)
       OR (visibility_block.blocker_id = ${alias}.author_id AND visibility_block.blocked_id = :viewerId)
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_mutes visibility_mute
    WHERE visibility_mute.user_id = :viewerId AND visibility_mute.muted_user_id = ${alias}.author_id
  )
  AND (
    ${alias}.author_id = :viewerId
    OR NOT EXISTS (
      SELECT 1 FROM profiles private_profile
      WHERE private_profile.user_id = ${alias}.author_id
        AND private_profile.profile_visibility = 'followers'
    )
    OR EXISTS (
      SELECT 1 FROM follows private_follow
      WHERE private_follow.follower_id = :viewerId
        AND private_follow.following_id = ${alias}.author_id
    )
  )
  AND (
    ${alias}.channel_id IS NULL
    OR ${alias}.channel_moderation_status = 'approved'
    OR ${alias}.author_id = :viewerId
    OR EXISTS (
      SELECT 1 FROM channel_members moderation_member
      WHERE moderation_member.channel_id = ${alias}.channel_id
        AND moderation_member.user_id = :viewerId
        AND moderation_member.left_at IS NULL
        AND moderation_member.role IN ('owner', 'moderator')
      )
  )
  AND (
    ${alias}.moderation_status IN ('active', 'flagged', 'appeal_accepted')
    OR ${alias}.author_id = :viewerId
    OR EXISTS (
      SELECT 1 FROM users moderation_user
      WHERE moderation_user.id = :viewerId
        AND moderation_user.global_role IN ('moderator', 'admin')
    )
  )
)`

const postSelect = (extraSelect = '') => `
  SELECT
    p.id,
    p.body,
    p.post_format,
    p.author_id,
    p.parent_post_id,
    p.repost_of_post_id,
    p.channel_id,
    p.visibility,
    p.created_at,
    p.updated_at,
    p.image_url,
    p.image_alt_text,
    p.content_warning,
    p.link_preview,
    p.channel_moderation_status,
    p.moderation_status,
    u.username,
    pr.display_name,
    COALESCE((
      SELECT jsonb_agg(post_badge.badge_type ORDER BY CASE post_badge.badge_type WHEN 'staff' THEN 0 ELSE 1 END)
      FROM user_badges post_badge
      WHERE post_badge.user_id = p.author_id AND post_badge.revoked_at IS NULL
    ), '[]'::JSONB) AS author_badges,
    pr.avatar_url,
    COUNT(DISTINCT pl.user_id)::INTEGER AS like_count,
    COUNT(DISTINCT reply.id)::INTEGER AS reply_count,
    EXISTS (
      SELECT 1 FROM post_likes own_like
      WHERE own_like.post_id = p.id AND own_like.user_id = :viewerId
    ) AS liked,
    EXISTS (
      SELECT 1 FROM follows follow_row
      WHERE follow_row.follower_id = :viewerId AND follow_row.following_id = p.author_id
    ) AS following
    , EXISTS (
      SELECT 1 FROM post_bookmarks own_bookmark
      WHERE own_bookmark.post_id = p.id AND own_bookmark.user_id = :viewerId
    ) AS bookmarked
    , (
      SELECT jsonb_build_object(
        'id', post_poll.id,
        'question', post_poll.question,
        'expiresAt', post_poll.expires_at,
        'totalVotes', (SELECT COUNT(*)::INTEGER FROM poll_votes total_vote WHERE total_vote.poll_id = post_poll.id),
        'viewerOptionId', (SELECT viewer_vote.option_id FROM poll_votes viewer_vote WHERE viewer_vote.poll_id = post_poll.id AND viewer_vote.user_id = :viewerId LIMIT 1),
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', poll_option.id,
            'label', poll_option.label,
            'position', poll_option.position,
            'votes', (SELECT COUNT(*)::INTEGER FROM poll_votes option_vote WHERE option_vote.option_id = poll_option.id)
          ) ORDER BY poll_option.position)
          FROM poll_options poll_option WHERE poll_option.poll_id = post_poll.id
        ), '[]'::JSONB)
      )
      FROM post_polls post_poll
      WHERE post_poll.post_id = p.id
    ) AS poll
    , (
      SELECT jsonb_build_object(
        'id', source.id,
        'body', source.body,
        'createdAt', source.created_at,
        'imageUrl', source.image_url,
        'imageAltText', source.image_alt_text,
        'contentWarning', source.content_warning,
        'author', jsonb_build_object(
          'id', source.author_id,
          'username', source_user.username,
          'displayName', COALESCE(source_profile.display_name, source_user.username),
          'avatarUrl', source_profile.avatar_url,
          'badges', COALESCE((
            SELECT jsonb_agg(source_badge.badge_type ORDER BY CASE source_badge.badge_type WHEN 'staff' THEN 0 ELSE 1 END)
            FROM user_badges source_badge
            WHERE source_badge.user_id = source.author_id AND source_badge.revoked_at IS NULL
          ), '[]'::JSONB)
        )
      )
      FROM posts source
      JOIN users source_user ON source_user.id = source.author_id
        AND source_user.deleted_at IS NULL
        AND source_user.status = 'active'
      LEFT JOIN profiles source_profile ON source_profile.user_id = source_user.id
      WHERE source.id = p.repost_of_post_id
        AND source.deleted_at IS NULL
        AND ${postVisibilityAccess('source')}
        AND ${channelAccess('source')}
    ) AS repost_of
    ${extraSelect}
  FROM posts p
  JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
  LEFT JOIN profiles pr ON pr.user_id = u.id
  LEFT JOIN post_likes pl ON pl.post_id = p.id
  LEFT JOIN posts reply ON reply.parent_post_id = p.id AND reply.deleted_at IS NULL
`

function mapPost(row) {
  const post = {
    id: row.id,
    body: row.body,
    postFormat: row.post_format || 'short',
    author: {
      id: row.author_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url || null,
      badges: row.author_badges || []
    },
    parentPostId: row.parent_post_id,
    repostOfPostId: row.repost_of_post_id,
    channelId: row.channel_id,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    moderationStatus: row.channel_moderation_status || 'approved',
    contentStatus: row.moderation_status || 'active',
    imageUrl: row.image_url || null,
    imageAltText: row.image_alt_text || null,
    contentWarning: row.content_warning || null,
    linkPreview: row.link_preview || null,
    poll: row.poll || null,
    likeCount: Number(row.like_count),
    replyCount: Number(row.reply_count),
    liked: Boolean(row.liked),
    following: Boolean(row.following),
    bookmarked: Boolean(row.bookmarked),
    repostOf: row.repost_of || null,
    isEdited: row.updated_at && row.created_at && new Date(row.updated_at).getTime() > new Date(row.created_at).getTime() + 1000
  }

  if (row.reply_depth !== undefined && row.reply_depth !== null) {
    post.depth = Number(row.reply_depth)
  }

  return post
}

async function selectPosts({
  viewerId,
  where,
  replacements,
  limit,
  order = 'DESC',
  orderBy,
  transaction,
  withClause = '',
  extraFrom = '',
  extraSelect = '',
  extraGroupBy = '',
  profileName = 'feed'
}) {
  const rows = await profiledQuery(profileName, `
    ${withClause}
    ${postSelect(extraSelect)}
    ${extraFrom}
    WHERE ${where}
    GROUP BY p.id, u.id, pr.user_id${extraGroupBy ? `, ${extraGroupBy}` : ''}
    ORDER BY ${orderBy || `p.created_at ${order}, p.id ${order}`}
    LIMIT :limit
  `, {
    replacements: { viewerId, limit, ...replacements },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })

  return rows.map(mapPost)
}

function extractHashtags(body = '') {
  return [...body.matchAll(/(?:^|\s)#([a-z0-9_]{1,64})\b/gi)]
    .map(match => match[1].toLowerCase())
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
}

function linkPreviewForBody(body = '') {
  const match = body.match(/https?:\/\/[^\s<]+/i)
  if (!match) return null

  const url = match[0].replace(/[),.!?]+$/, '')
  try {
    const parsed = new URL(url)
    return {
      url,
      hostname: parsed.hostname,
      label: parsed.hostname.replace(/^www\./, '')
    }
  } catch {
    return null
  }
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

async function syncPostHashtags(postId, body, transaction) {
  const tags = extractHashtags(body)
  await sequelize.query('DELETE FROM post_hashtags WHERE post_id = :postId', {
    replacements: { postId },
    transaction
  })

  for (const tag of tags) {
    const rows = await sequelize.query(`
      INSERT INTO hashtags (tag)
      VALUES (:tag)
      ON CONFLICT (tag) DO UPDATE SET tag = EXCLUDED.tag
      RETURNING id
    `, {
      replacements: { tag },
      type: QueryTypes.SELECT,
      transaction
    })
    await sequelize.query(`
      INSERT INTO post_hashtags (post_id, hashtag_id)
      VALUES (:postId, :hashtagId)
      ON CONFLICT DO NOTHING
    `, {
      replacements: { postId, hashtagId: rows[0].id },
      transaction
    })
  }
}

export async function listPosts(viewerId, {
  cursor,
  limit,
  feed = 'home',
  authorId = null,
  channelId = null,
  searchQuery = null,
  hashtag = null,
  bookmarkedOnly = false
}) {
  const where = [
    "p.deleted_at IS NULL",
    postVisibilityAccess('p'),
    channelAccess('p')
  ]

  if (!channelId) {
    where.push('p.channel_id IS NULL')
  }
  const replacements = {}

  if (feed === 'following') {
    where.push(`(
      p.author_id = :viewerId OR EXISTS (
        SELECT 1 FROM follows feed_follow
        WHERE feed_follow.follower_id = :viewerId
          AND feed_follow.following_id = p.author_id
      )
    )`)
  }

  if (authorId) {
    where.push('p.author_id = :authorId')
    replacements.authorId = authorId
  }

  if (channelId) {
    where.push('p.channel_id = :channelId')
    replacements.channelId = channelId
  }

  if (searchQuery) {
    where.push('p.body ILIKE :searchPattern')
    replacements.searchPattern = `%${searchQuery}%`
  }

  if (hashtag) {
    where.push(`EXISTS (
      SELECT 1
      FROM post_hashtags matching_post_hashtag
      JOIN hashtags matching_hashtag ON matching_hashtag.id = matching_post_hashtag.hashtag_id
      WHERE matching_post_hashtag.post_id = p.id AND matching_hashtag.tag = :hashtag
    )`)
    replacements.hashtag = hashtag.toLowerCase()
  }

  if (bookmarkedOnly) {
    where.push(`EXISTS (
      SELECT 1 FROM post_bookmarks viewer_bookmark
      WHERE viewer_bookmark.post_id = p.id AND viewer_bookmark.user_id = :viewerId
    )`)
  }

  if (cursor) {
    where.push('(p.created_at, p.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }

  const rows = await selectPosts({
    viewerId,
    where: where.join(' AND '),
    replacements,
    limit: limit + 1,
    profileName: searchQuery ? 'search_posts' : 'feed'
  })
  const hasMore = rows.length > limit
  const posts = hasMore ? rows.slice(0, limit) : rows
  const last = posts.at(-1)

  return {
    posts,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
  }
}

export async function listPopularPosts(viewerId, limit) {
  const key = cacheKey('popular-posts', { viewerId, limit })
  const cached = cacheGet(key)
  if (cached) return cached
  return cacheSet(key, await selectPosts({
    viewerId,
    where: `p.deleted_at IS NULL AND p.channel_id IS NULL AND ${postVisibilityAccess('p')}`,
    replacements: {},
    limit,
    orderBy: 'like_count DESC, reply_count DESC, p.created_at DESC, p.id DESC',
    profileName: 'popular_posts'
  }), 5000)
}

async function listThreadReplies(viewerId, postId, transaction) {
  return selectPosts({
    viewerId,
    withClause: `
      WITH RECURSIVE reply_tree AS (
        SELECT
          p.id,
          p.parent_post_id,
          1::INTEGER AS depth,
          ARRAY[p.id] AS path
        FROM posts p
        JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
        WHERE p.parent_post_id = :rootPostId
          AND p.deleted_at IS NULL
          AND ${postVisibilityAccess('p')}

        UNION ALL

        SELECT
          child.id,
          child.parent_post_id,
          reply_tree.depth + 1,
          reply_tree.path || child.id
        FROM posts child
        JOIN users child_user ON child_user.id = child.author_id
          AND child_user.deleted_at IS NULL
          AND child_user.status = 'active'
        JOIN reply_tree ON reply_tree.id = child.parent_post_id
        WHERE child.deleted_at IS NULL
          AND ${postVisibilityAccess('child')}
          AND reply_tree.depth < :maxReplyDepth
          AND NOT child.id = ANY(reply_tree.path)
      )
    `,
    extraFrom: 'JOIN reply_tree ON reply_tree.id = p.id',
    extraSelect: ', reply_tree.depth AS reply_depth',
    extraGroupBy: 'reply_tree.depth',
    where: `p.deleted_at IS NULL AND ${postVisibilityAccess('p')} AND ${channelAccess('p')}`,
    replacements: {
      rootPostId: postId,
      maxReplyDepth: MAX_REPLY_DEPTH
    },
    limit: MAX_THREAD_REPLIES,
    profileName: 'post_replies',
    order: 'ASC',
    transaction
  })
}

export async function getPostById(viewerId, postId, transaction) {
  const posts = await selectPosts({
    viewerId,
    where: `p.id = :postId AND p.deleted_at IS NULL AND ${postVisibilityAccess('p')} AND ${channelAccess('p')}`,
    replacements: { postId },
    limit: 1,
    transaction
  })
  const post = posts[0]

  if (!post) {
    throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
  }

  const replies = await listThreadReplies(viewerId, postId, transaction)

  return { ...post, replies }
}

export async function createPost(authorId, input) {
  const postId = await withTransaction(async transaction => {
    const contentSignal = await inspectContent({ userId: authorId, action: 'post', body: input.body, transaction })
    const contentModerationStatus = contentSignal.flagged ? 'flagged' : 'active'
    let channelModerationStatus = 'approved'
    if (input.channelId) {
      const channel = await sequelize.query(
        `SELECT c.id, member.user_id AS member_id, member.role AS member_role,
          c.post_approval_required
         FROM channels c
         LEFT JOIN channel_members member ON member.channel_id = c.id
           AND member.user_id = :authorId AND member.left_at IS NULL
         WHERE c.id = :id AND c.deleted_at IS NULL LIMIT 1`,
        {
          replacements: { id: input.channelId, authorId },
          type: QueryTypes.SELECT,
          transaction
        }
      )
      if (!channel[0]) throw new HttpError(400, 'CHANNEL_NOT_FOUND', 'Channel not found')
      if (!channel[0].member_id) throw new HttpError(403, 'CHANNEL_MEMBERSHIP_REQUIRED', 'Join channel before posting')
      if (channel[0].post_approval_required && !['owner', 'moderator'].includes(channel[0].member_role)) {
        channelModerationStatus = 'pending'
      }
    }

    if (input.repostOfPostId) {
      const sourceRows = await sequelize.query(`
        SELECT p.id
        FROM posts p
        JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
        WHERE p.id = :sourcePostId
          AND p.deleted_at IS NULL
          AND p.visibility = 'public'
          AND ${postVisibilityAccess('p')}
          AND ${channelAccess('p')}
        LIMIT 1
      `, {
        replacements: { sourcePostId: input.repostOfPostId, viewerId: authorId },
        type: QueryTypes.SELECT,
        transaction
      })
      if (!sourceRows[0]) throw new HttpError(404, 'SOURCE_POST_NOT_FOUND', 'Post to repost not found')
    }

    const rows = await sequelize.query(`
      INSERT INTO posts (
        author_id,
        channel_id,
        body,
        post_format,
        visibility,
        repost_of_post_id,
        image_url,
        image_alt_text,
        content_warning,
        link_preview,
        channel_moderation_status,
        moderation_status
      )
      VALUES (
        :authorId,
        :channelId,
        :body,
        :postFormat,
        :visibility,
        :repostOfPostId,
        :imageUrl,
        :imageAltText,
        :contentWarning,
        CAST(:linkPreview AS JSONB),
        :channelModerationStatus,
        :contentModerationStatus
      )
      RETURNING id
    `, {
      replacements: {
        authorId,
        channelId: input.channelId || null,
        body: input.body || '',
        postFormat: input.postFormat || 'short',
        visibility: input.visibility,
        repostOfPostId: input.repostOfPostId || null,
        imageUrl: input.imageUrl || null,
        imageAltText: input.imageAltText || null,
        contentWarning: input.contentWarning || null,
        linkPreview: JSON.stringify(linkPreviewForBody(input.body)),
        channelModerationStatus,
        contentModerationStatus
      },
      type: QueryTypes.SELECT,
      transaction
    })

    await syncPostHashtags(rows[0].id, input.body, transaction)
    if (input.channelId && channelModerationStatus === 'approved') {
      await sequelize.query(`
        UPDATE channels
        SET discovery_score = discovery_score + 2, updated_at = CURRENT_TIMESTAMP
        WHERE id = :channelId
      `, { replacements: { channelId: input.channelId }, transaction })
      await notifyChannelMembers(input.channelId, authorId, rows[0].id, transaction)
    }

    return rows[0].id
  })

  return getPostById(authorId, postId)
}

export async function createReply(authorId, parentPostId, input) {
  const reply = await withTransaction(async transaction => {
    const contentSignal = await inspectContent({ userId: authorId, action: 'reply', body: input.body, transaction })
    const contentModerationStatus = contentSignal.flagged ? 'flagged' : 'active'
    const parentRows = await sequelize.query(`
      SELECT p.id, p.author_id, p.channel_id
      FROM posts p
      JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
      WHERE p.id = :parentPostId
        AND p.deleted_at IS NULL
        AND ${postVisibilityAccess('p')}
        AND ${channelAccess('p')}
      LIMIT 1
    `, {
      replacements: { parentPostId, viewerId: authorId },
      type: QueryTypes.SELECT,
      transaction
    })
    const parent = parentRows[0]

    if (!parent) {
      throw new HttpError(404, 'PARENT_POST_NOT_FOUND', 'Parent post not found')
    }

    const depthRows = await sequelize.query(`
      WITH RECURSIVE ancestors AS (
        SELECT
          p.id,
          p.parent_post_id,
          0::INTEGER AS depth,
          ARRAY[p.id] AS path
        FROM posts p
        WHERE p.id = :parentPostId
          AND p.deleted_at IS NULL

        UNION ALL

        SELECT
          parent.id,
          parent.parent_post_id,
          ancestors.depth + 1,
          ancestors.path || parent.id
        FROM posts parent
        JOIN ancestors ON ancestors.parent_post_id = parent.id
        WHERE parent.deleted_at IS NULL
          AND ancestors.depth < :maxReplyDepth
          AND NOT parent.id = ANY(ancestors.path)
      )
      SELECT COALESCE(MAX(depth), 0)::INTEGER AS depth
      FROM ancestors
    `, {
      replacements: {
        parentPostId,
        maxReplyDepth: MAX_REPLY_DEPTH
      },
      type: QueryTypes.SELECT,
      transaction
    })
    const parentDepth = Number(depthRows[0]?.depth || 0)

    if (parentDepth >= MAX_REPLY_DEPTH) {
      throw new HttpError(400, 'REPLY_DEPTH_LIMIT', `Replies can be nested only ${MAX_REPLY_DEPTH} levels deep`)
    }

    let channelModerationStatus = 'approved'
    if (parent.channel_id) {
      const channelState = await sequelize.query(`
        SELECT channel.post_approval_required, member.role
        FROM channels channel
        JOIN channel_members member ON member.channel_id = channel.id
          AND member.user_id = :authorId AND member.left_at IS NULL
        WHERE channel.id = :channelId AND channel.deleted_at IS NULL
        LIMIT 1
      `, {
        replacements: { authorId, channelId: parent.channel_id },
        type: QueryTypes.SELECT,
        transaction
      })
      if (!channelState[0]) throw new HttpError(403, 'CHANNEL_MEMBERSHIP_REQUIRED', 'Join channel before replying')
      if (channelState[0].post_approval_required && !['owner', 'moderator'].includes(channelState[0].role)) {
        channelModerationStatus = 'pending'
      }
    }

    const replyRows = await sequelize.query(`
      INSERT INTO posts (
        author_id, parent_post_id, channel_id, body, visibility, channel_moderation_status, moderation_status
      )
      VALUES (:authorId, :parentPostId, :channelId, :body, 'public', :channelModerationStatus, :contentModerationStatus)
      RETURNING id
    `, {
      replacements: {
        authorId,
        parentPostId,
        channelId: parent.channel_id || null,
        body: input.body,
        channelModerationStatus,
        contentModerationStatus
      },
      type: QueryTypes.SELECT,
      transaction
    })
    const replyId = replyRows[0].id

    await syncPostHashtags(replyId, input.body, transaction)

    if (channelModerationStatus === 'approved') {
      await notifyReply({
        recipientId: parent.author_id,
        actorId: authorId,
        postId: parentPostId,
        replyId
      }, transaction)
      if (parent.channel_id) {
        await sequelize.query(`
          UPDATE channels
          SET discovery_score = discovery_score + 2, updated_at = CURRENT_TIMESTAMP
          WHERE id = :channelId
        `, { replacements: { channelId: parent.channel_id }, transaction })
        await notifyChannelMembers(parent.channel_id, authorId, replyId, transaction)
      }
    }

    return { replyId, depth: parentDepth + 1 }
  })

  const rows = await selectPosts({
    viewerId: authorId,
    where: `p.id = :replyId AND p.deleted_at IS NULL AND ${postVisibilityAccess('p')} AND ${channelAccess('p')}`,
    replacements: { replyId: reply.replyId },
    limit: 1
  })

  if (!rows[0]) {
    throw new HttpError(404, 'REPLY_NOT_FOUND', 'Reply not found')
  }

  return { ...rows[0], depth: reply.depth }
}

export async function deletePost(authorId, postId) {
  const rows = await sequelize.query(`
    UPDATE posts
    SET deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = :postId AND author_id = :authorId AND deleted_at IS NULL
    RETURNING id, channel_id, channel_moderation_status
  `, {
    replacements: { authorId, postId },
    type: QueryTypes.SELECT
  })

  if (!rows[0]) {
    throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
  }

  if (rows[0].channel_id && rows[0].channel_moderation_status === 'approved') {
    await sequelize.query(`
      UPDATE channels
      SET discovery_score = GREATEST(0, discovery_score - 2), updated_at = CURRENT_TIMESTAMP,
          pinned_post_id = CASE WHEN pinned_post_id = :postId THEN NULL ELSE pinned_post_id END
      WHERE id = :channelId
    `, { replacements: { channelId: rows[0].channel_id, postId }, type: QueryTypes.UPDATE })
  }

  return { id: rows[0].id }
}

export async function updatePost(authorId, postId, input) {
  return withTransaction(async transaction => {
    const rows = await sequelize.query(`
      SELECT id, body, post_format, visibility, image_url, image_alt_text, content_warning, repost_of_post_id, created_at
      FROM posts
      WHERE id = :postId AND author_id = :authorId AND deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: { postId, authorId },
      type: QueryTypes.SELECT,
      transaction
    })
    const current = rows[0]

    if (!current) throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
    if (Date.now() - new Date(current.created_at).getTime() > POST_EDIT_WINDOW_MS) {
      throw new HttpError(400, 'POST_EDIT_WINDOW_EXPIRED', 'Posts can only be edited for 24 hours')
    }

    const body = input.body
    if (!body && !current.repost_of_post_id) {
      throw new HttpError(400, 'POST_BODY_REQUIRED', 'Post text cannot be empty')
    }
    const contentSignal = await inspectContent({ userId: authorId, action: 'post_edit', body, transaction })
    const next = {
      body,
      postFormat: input.postFormat || current.post_format || 'short',
      visibility: input.visibility || current.visibility,
      imageUrl: Object.hasOwn(input, 'imageUrl') ? input.imageUrl : current.image_url,
      imageAltText: Object.hasOwn(input, 'imageAltText') ? input.imageAltText : current.image_alt_text,
      contentWarning: Object.hasOwn(input, 'contentWarning') ? input.contentWarning : current.content_warning
    }

    await sequelize.query(`
      INSERT INTO post_edits (
        post_id, editor_id, body, post_format, visibility, image_url, image_alt_text, content_warning
      )
      VALUES (:postId, :authorId, :body, :postFormat, :visibility, :imageUrl, :imageAltText, :contentWarning)
    `, {
      replacements: { postId, authorId, ...current, ...next },
      transaction
    })
    await sequelize.query(`
      UPDATE posts
      SET body = :body,
          post_format = :postFormat,
          visibility = :visibility,
          image_url = :imageUrl,
          image_alt_text = :imageAltText,
          content_warning = :contentWarning,
          moderation_status = CASE WHEN :contentFlagged = TRUE THEN 'flagged' ELSE moderation_status END,
          link_preview = CAST(:linkPreview AS JSONB),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = :postId
    `, {
      replacements: {
        postId,
        ...next,
        linkPreview: JSON.stringify(linkPreviewForBody(body)),
        contentFlagged: contentSignal.flagged
      },
      transaction
    })
    await syncPostHashtags(postId, body, transaction)

    return getPostById(authorId, postId, transaction)
  })
}

export async function getPostEditHistory(viewerId, postId) {
  await getPostById(viewerId, postId)
  const rows = await sequelize.query(`
    SELECT id, body, post_format, visibility, image_url, image_alt_text, content_warning, created_at
    FROM post_edits
    WHERE post_id = :postId
    ORDER BY created_at DESC, id DESC
  `, {
    replacements: { postId },
    type: QueryTypes.SELECT
  })

  return rows.map(row => ({
    id: row.id,
    body: row.body,
    postFormat: row.post_format || 'short',
    visibility: row.visibility,
    imageUrl: row.image_url || null,
    imageAltText: row.image_alt_text || null,
    contentWarning: row.content_warning || null,
    createdAt: row.created_at
  }))
}

export async function bookmarkPost(userId, postId) {
  return withTransaction(async transaction => {
    const rows = await sequelize.query(`
      SELECT p.id
      FROM posts p
      JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
      WHERE p.id = :postId
        AND p.deleted_at IS NULL
        AND ${postVisibilityAccess('p')}
        AND ${channelAccess('p')}
      LIMIT 1
    `, {
      replacements: { postId, viewerId: userId },
      type: QueryTypes.SELECT,
      transaction
    })
    if (!rows[0]) throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')

    await sequelize.query(`
      INSERT INTO post_bookmarks (post_id, user_id)
      VALUES (:postId, :userId)
      ON CONFLICT (post_id, user_id) DO NOTHING
    `, {
      replacements: { postId, userId },
      transaction
    })
    return { postId, bookmarked: true }
  })
}

export async function unbookmarkPost(userId, postId) {
  await sequelize.query(`
    DELETE FROM post_bookmarks
    WHERE post_id = :postId AND user_id = :userId
  `, { replacements: { postId, userId } })
  return { postId, bookmarked: false }
}

export async function listBookmarkedPosts(viewerId, options) {
  return listPosts(viewerId, { ...options, bookmarkedOnly: true })
}

async function getLikeState(userId, postId, transaction) {
  const rows = await sequelize.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM post_likes
        WHERE post_id = :postId AND user_id = :userId
      ) AS liked,
      COUNT(post_likes.user_id)::INTEGER AS like_count
    FROM posts
    LEFT JOIN post_likes ON post_likes.post_id = posts.id
    WHERE posts.id = :postId
      AND posts.deleted_at IS NULL
      AND ${postVisibilityAccess('posts')}
      AND ${channelAccess('posts')}
    GROUP BY posts.id
  `, {
    replacements: { userId, postId, viewerId: userId },
    type: QueryTypes.SELECT,
    transaction
  })

  if (!rows[0]) {
    throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
  }

  return {
    postId,
    liked: Boolean(rows[0].liked),
    likeCount: Number(rows[0].like_count)
  }
}

export async function likePost(userId, postId) {
  return withTransaction(async transaction => {
    const postRows = await sequelize.query(`
      SELECT p.id, p.author_id
      FROM posts p
      JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
      WHERE p.id = :postId
        AND p.deleted_at IS NULL
        AND ${postVisibilityAccess('p')}
        AND ${channelAccess('p')}
      LIMIT 1
    `, {
      replacements: { postId, viewerId: userId },
      type: QueryTypes.SELECT,
      transaction
    })
    const post = postRows[0]

    if (!post) {
      throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
    }

    const insertedRows = await sequelize.query(`
      INSERT INTO post_likes (post_id, user_id)
      VALUES (:postId, :userId)
      ON CONFLICT (post_id, user_id) DO NOTHING
      RETURNING post_id
    `, {
      replacements: { postId, userId },
      type: QueryTypes.SELECT,
      transaction
    })

    if (insertedRows[0]) {
      await notifyLike({ recipientId: post.author_id, actorId: userId, postId }, transaction)
    }

    return getLikeState(userId, postId, transaction)
  })
}

export async function unlikePost(userId, postId) {
  return withTransaction(async transaction => {
    const state = await getLikeState(userId, postId, transaction)

    if (state.liked) {
      await sequelize.query(`
        DELETE FROM post_likes
        WHERE post_id = :postId AND user_id = :userId
      `, {
        replacements: { postId, userId },
        transaction
      })

      await sequelize.query(`
        DELETE FROM notifications
        WHERE actor_id = :userId
          AND post_id = :postId
          AND type = 'like'
      `, {
        replacements: { postId, userId },
        transaction
      })
    }

    return getLikeState(userId, postId, transaction)
  })
}
