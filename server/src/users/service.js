import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'
import { listPosts } from '../posts/service.js'
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
      bannerUrl: row.banner_url || null
    }
  }
}

async function findPublicUser(identifier, transaction) {
  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.created_at, p.display_name, p.bio, p.avatar_url, p.banner_url
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
      ) AS followed_by_viewer
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

  return {
    ...mapUser(user),
    followerCount: Number(counts.follower_count),
    followingCount: Number(counts.following_count),
    followedByViewer: Boolean(counts.followed_by_viewer),
    isSelf: user.id === viewerId
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

export async function listConnections(username, kind, { cursor, limit }) {
  const owner = await findPublicUser({ username })
  const following = kind === 'following'
  const userColumn = following ? 'connection.following_id' : 'connection.follower_id'
  const ownerColumn = following ? 'connection.follower_id' : 'connection.following_id'
  const where = [`${ownerColumn} = :ownerId`]
  const replacements = { ownerId: owner.id }

  if (cursor) {
    where.push('(connection.created_at, u.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }

  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.created_at, p.display_name, p.bio, p.avatar_url, p.banner_url,
      connection.created_at AS connected_at
    FROM follows connection
    JOIN users u ON u.id = ${userColumn} AND u.deleted_at IS NULL AND u.status = 'active'
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE ${where.join(' AND ')}
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
