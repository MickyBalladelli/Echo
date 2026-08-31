import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'
import { getPostById, listPosts } from '../posts/service.js'
import { notifyFollow } from '../notifications/service.js'

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    profile: {
      displayName: row.display_name || row.username,
      bio: row.bio || '',
      avatarUrl: row.avatar_url || null,
      bannerUrl: row.banner_url || null,
      pinnedPostId: row.pinned_post_id || null,
      profileVisibility: row.profile_visibility || 'public',
      showFollowers: row.show_followers !== false,
      showFollowing: row.show_following !== false,
      badges: row.badges || []
    },
    mutualCount: Number(row.mutual_count || 0),
    mutual: Boolean(row.mutual)
  }
}

async function findPublicUser(identifier, transaction) {
  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.created_at, p.display_name, p.bio, p.avatar_url, p.banner_url,
      p.pinned_post_id, p.profile_visibility, p.show_followers, p.show_following,
      COALESCE((
        SELECT jsonb_agg(badge.badge_type ORDER BY CASE badge.badge_type WHEN 'staff' THEN 0 ELSE 1 END)
        FROM user_badges badge
        WHERE badge.user_id = u.id AND badge.revoked_at IS NULL
      ), '[]'::JSONB) AS badges
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE ${identifier.id ? 'u.id = :id' : 'LOWER(u.username) = LOWER(:username)'}
      AND u.deleted_at IS NULL
      AND u.status = 'active'
    LIMIT 1
  `, {
    replacements: identifier,
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })

  if (!rows[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found')
  return rows[0]
}

export async function getPublicProfile(viewerId, username) {
  const user = await findPublicUser({ username })
  const rows = await sequelize.query(`
    SELECT
      COUNT(DISTINCT followers.follower_id)::INTEGER AS follower_count,
      COUNT(DISTINCT following.following_id)::INTEGER AS following_count,
      EXISTS (
        SELECT 1 FROM follows viewer_follow
        WHERE viewer_follow.follower_id = :viewerId
          AND viewer_follow.following_id = :userId
      ) AS followed_by_viewer,
      (
        SELECT COUNT(*)::INTEGER
        FROM follows viewer_mutual
        JOIN follows profile_mutual ON profile_mutual.following_id = viewer_mutual.following_id
        WHERE viewer_mutual.follower_id = :viewerId
          AND profile_mutual.follower_id = :userId
      ) AS mutual_count
    FROM users u
    LEFT JOIN follows followers ON followers.following_id = u.id
    LEFT JOIN follows following ON following.follower_id = u.id
    WHERE u.id = :userId
    GROUP BY u.id
  `, {
    replacements: { viewerId, userId: user.id },
    type: QueryTypes.SELECT
  })
  const counts = rows[0]
  const followedByViewer = Boolean(counts.followed_by_viewer)
  const isSelf = user.id === viewerId
  const relationship = await getRelationshipState(viewerId, user.id)
  const isBlocked = relationship.blockedByViewer || relationship.blockedViewer
  const isPrivate = isBlocked || (user.profile_visibility === 'followers' && !isSelf && !followedByViewer)

  let pinnedPost = null
  if (user.pinned_post_id && !isPrivate) {
    try {
      pinnedPost = await getPostById(viewerId, user.pinned_post_id)
    } catch (error) {
      if (error.code !== 'POST_NOT_FOUND') throw error
    }
  }

  return {
    ...mapUser({
      ...user,
      bio: isPrivate ? '' : user.bio,
      avatar_url: isBlocked ? null : user.avatar_url,
      banner_url: isPrivate ? null : user.banner_url,
      badges: isBlocked ? [] : user.badges
    }),
    followerCount: isPrivate ? 0 : Number(counts.follower_count),
    followingCount: isPrivate ? 0 : Number(counts.following_count),
    followedByViewer,
    mutualFollowerCount: isPrivate ? 0 : Number(counts.mutual_count || 0),
    isSelf,
    isPrivate,
    isBlocked,
    ...relationship,
    pinnedPost: isPrivate ? null : pinnedPost
  }
}

export async function getRelationshipState(viewerId, userId) {
  const rows = await sequelize.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM user_blocks
        WHERE blocker_id = :viewerId AND blocked_id = :userId
      ) AS blocked_by_viewer,
      EXISTS (
        SELECT 1 FROM user_blocks
        WHERE blocker_id = :userId AND blocked_id = :viewerId
      ) AS blocked_viewer,
      EXISTS (
        SELECT 1 FROM user_mutes
        WHERE user_id = :viewerId AND muted_user_id = :userId
      ) AS muted_by_viewer,
      EXISTS (
        SELECT 1 FROM user_restrictions
        WHERE user_id = :viewerId AND restricted_user_id = :userId
      ) AS restricted_by_viewer
  `, { replacements: { viewerId, userId }, type: QueryTypes.SELECT })
  const row = rows[0]
  return {
    blockedByViewer: Boolean(row.blocked_by_viewer),
    blockedViewer: Boolean(row.blocked_viewer),
    mutedByViewer: Boolean(row.muted_by_viewer),
    restrictedByViewer: Boolean(row.restricted_by_viewer)
  }
}

async function getFollowState(viewerId, userId, transaction) {
  const rows = await sequelize.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM follows
        WHERE follower_id = :viewerId AND following_id = :userId
      ) AS following,
      COUNT(DISTINCT followers.follower_id)::INTEGER AS follower_count
    FROM users u
    LEFT JOIN follows followers ON followers.following_id = u.id
    WHERE u.id = :userId AND u.deleted_at IS NULL AND u.status = 'active'
    GROUP BY u.id
  `, {
    replacements: { viewerId, userId },
    type: QueryTypes.SELECT,
    transaction
  })

  if (!rows[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found')
  return {
    userId,
    following: Boolean(rows[0].following),
    followerCount: Number(rows[0].follower_count)
  }
}

export async function followUser(viewerId, userId) {
  if (viewerId === userId) throw new HttpError(400, 'SELF_FOLLOW_NOT_ALLOWED', 'You cannot follow yourself')

  return withTransaction(async transaction => {
    await findPublicUser({ id: userId }, transaction)
    const blocked = await sequelize.query(`
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = :viewerId AND blocked_id = :userId)
         OR (blocker_id = :userId AND blocked_id = :viewerId)
      LIMIT 1
    `, { replacements: { viewerId, userId }, type: QueryTypes.SELECT, transaction })
    if (blocked[0]) throw new HttpError(403, 'USER_BLOCKED', 'Cannot follow this user')
    const inserted = await sequelize.query(`
      INSERT INTO follows (follower_id, following_id)
      VALUES (:viewerId, :userId)
      ON CONFLICT (follower_id, following_id) DO NOTHING
      RETURNING following_id
    `, {
      replacements: { viewerId, userId },
      type: QueryTypes.SELECT,
      transaction
    })

    if (inserted[0]) {
      await notifyFollow({ recipientId: userId, actorId: viewerId }, transaction)
    }

    return getFollowState(viewerId, userId, transaction)
  })
}

export async function unfollowUser(viewerId, userId) {
  if (viewerId === userId) throw new HttpError(400, 'SELF_FOLLOW_NOT_ALLOWED', 'You cannot unfollow yourself')

  return withTransaction(async transaction => {
    await findPublicUser({ id: userId }, transaction)
    await sequelize.query(`
      DELETE FROM follows WHERE follower_id = :viewerId AND following_id = :userId
    `, { replacements: { viewerId, userId }, transaction })
    await sequelize.query(`
      DELETE FROM notifications
      WHERE recipient_id = :userId AND actor_id = :viewerId AND type = 'follow'
    `, { replacements: { viewerId, userId }, transaction })
    return getFollowState(viewerId, userId, transaction)
  })
}

export async function listConnections(viewerId, username, kind, { cursor, limit }) {
  const owner = await findPublicUser({ username })
  const ownerRelationship = await getRelationshipState(viewerId, owner.id)
  if (ownerRelationship.blockedByViewer || ownerRelationship.blockedViewer) {
    return { users: [], nextCursor: null }
  }
  const ownerIsSelf = owner.id === viewerId
  const ownerFollowsViewer = await sequelize.query(`
    SELECT EXISTS (
      SELECT 1 FROM follows WHERE follower_id = :viewerId AND following_id = :ownerId
    ) AS followed
  `, { replacements: { viewerId, ownerId: owner.id }, type: QueryTypes.SELECT })
  const ownerFollowedByViewer = Boolean(ownerFollowsViewer[0]?.followed)
  if ((!ownerIsSelf && owner.profile_visibility === 'followers' && !ownerFollowedByViewer) ||
      (kind === 'followers' && owner.show_followers === false) ||
      (kind === 'following' && owner.show_following === false)) {
    return { users: [], nextCursor: null }
  }
  const following = kind === 'following'
  const userColumn = following ? 'connection.following_id' : 'connection.follower_id'
  const ownerColumn = following ? 'connection.follower_id' : 'connection.following_id'
  const where = [`${ownerColumn} = :ownerId`]
  const replacements = { ownerId: owner.id, viewerId }

  if (cursor) {
    where.push('(connection.created_at, u.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }

  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.created_at, p.display_name, p.bio, p.avatar_url, p.banner_url,
      connection.created_at AS connected_at,
      (
        SELECT COUNT(DISTINCT mutual_viewer.following_id)::INTEGER
        FROM follows mutual_viewer
        JOIN follows mutual_user ON mutual_user.following_id = mutual_viewer.following_id
        WHERE mutual_viewer.follower_id = :viewerId AND mutual_user.follower_id = u.id
      ) AS mutual_count,
      EXISTS (
        SELECT 1 FROM follows viewer_follow
        WHERE viewer_follow.follower_id = :viewerId AND viewer_follow.following_id = u.id
      ) AND EXISTS (
        SELECT 1 FROM follows user_follow
        WHERE user_follow.follower_id = u.id AND user_follow.following_id = :viewerId
      ) AS mutual
    FROM follows connection
    JOIN users u ON u.id = ${userColumn} AND u.deleted_at IS NULL AND u.status = 'active'
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE ${where.join(' AND ')}
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks connection_block
        WHERE (connection_block.blocker_id = :viewerId AND connection_block.blocked_id = u.id)
           OR (connection_block.blocker_id = u.id AND connection_block.blocked_id = :viewerId)
      )
    ORDER BY connection.created_at DESC, u.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)

  return {
    users: page.map(mapUser),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.connected_at, id: last.id }) : null
  }
}

export async function listUserPosts(viewerId, username, options) {
  const user = await findPublicUser({ username })
  return listPosts(viewerId, { ...options, authorId: user.id })
}

export async function setRelationship(viewerId, userId, kind, active) {
  if (viewerId === userId) throw new HttpError(400, 'SELF_RELATIONSHIP_NOT_ALLOWED', 'Cannot change your relationship with yourself')
  await findPublicUser({ id: userId })
  const tables = {
    block: ['user_blocks', 'blocker_id', 'blocked_id'],
    mute: ['user_mutes', 'user_id', 'muted_user_id'],
    restrict: ['user_restrictions', 'user_id', 'restricted_user_id']
  }
  const relation = tables[kind]
  if (!relation) throw new HttpError(400, 'INVALID_RELATIONSHIP', 'Unknown relationship')
  const [table, leftColumn, rightColumn] = relation

  if (active) {
    await sequelize.query(`
      INSERT INTO ${table} (${leftColumn}, ${rightColumn}) VALUES (:viewerId, :userId)
      ON CONFLICT (${leftColumn}, ${rightColumn}) DO NOTHING
    `, { replacements: { viewerId, userId } })
    if (kind === 'block') {
      await sequelize.query(`
        DELETE FROM follows
        WHERE (follower_id = :viewerId AND following_id = :userId)
           OR (follower_id = :userId AND following_id = :viewerId)
      `, { replacements: { viewerId, userId } })
    }
  } else {
    await sequelize.query(`DELETE FROM ${table} WHERE ${leftColumn} = :viewerId AND ${rightColumn} = :userId`, {
      replacements: { viewerId, userId }
    })
  }

  return { userId, ...(await getRelationshipState(viewerId, userId)) }
}

export async function listSuggestedUsers(viewerId, limit) {
  const rows = await sequelize.query(`
    SELECT candidate.id, candidate.username, candidate.created_at,
      profile.display_name, profile.bio, profile.avatar_url, profile.banner_url,
      (
        SELECT COUNT(DISTINCT viewer_follow.following_id)::INTEGER
        FROM follows viewer_follow
        JOIN follows candidate_follow ON candidate_follow.following_id = viewer_follow.following_id
        WHERE viewer_follow.follower_id = :viewerId
          AND candidate_follow.follower_id = candidate.id
      ) AS mutual_count,
      (
        SELECT COUNT(*)::INTEGER FROM follows candidate_followers
        WHERE candidate_followers.following_id = candidate.id
      ) AS follower_count
    FROM users candidate
    LEFT JOIN profiles profile ON profile.user_id = candidate.id
    WHERE candidate.id <> :viewerId
      AND candidate.deleted_at IS NULL
      AND candidate.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM follows already_following
        WHERE already_following.follower_id = :viewerId
          AND already_following.following_id = candidate.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks candidate_block
        WHERE (candidate_block.blocker_id = :viewerId AND candidate_block.blocked_id = candidate.id)
           OR (candidate_block.blocker_id = candidate.id AND candidate_block.blocked_id = :viewerId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_mutes candidate_mute
        WHERE candidate_mute.user_id = :viewerId AND candidate_mute.muted_user_id = candidate.id
      )
    ORDER BY mutual_count DESC, follower_count DESC, candidate.created_at DESC, candidate.id DESC
    LIMIT :limit
  `, { replacements: { viewerId, limit }, type: QueryTypes.SELECT })
  return rows.map(mapUser)
}

export async function setPinnedPost(userId, postId) {
  if (postId) {
    const rows = await sequelize.query(`
      SELECT id
      FROM posts
      WHERE id = :postId
        AND author_id = :userId
        AND deleted_at IS NULL
        AND visibility = 'public'
        AND moderation_status IN ('active', 'flagged', 'appeal_accepted')
      LIMIT 1
    `, {
      replacements: { postId, userId },
      type: QueryTypes.SELECT
    })
    if (!rows[0]) throw new HttpError(400, 'PINNED_POST_INVALID', 'Only your public posts can be pinned')
  }

  await sequelize.query(`
    UPDATE profiles
    SET pinned_post_id = :postId, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = :userId
  `, { replacements: { userId, postId: postId || null } })

  return { pinnedPostId: postId || null }
}
