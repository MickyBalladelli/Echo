import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'

const postSelect = `
  SELECT
    p.id,
    p.body,
    p.author_id,
    p.parent_post_id,
    p.channel_id,
    p.visibility,
    p.created_at,
    p.updated_at,
    u.username,
    pr.display_name,
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
  FROM posts p
  JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
  LEFT JOIN profiles pr ON pr.user_id = u.id
  LEFT JOIN post_likes pl ON pl.post_id = p.id
  LEFT JOIN posts reply ON reply.parent_post_id = p.id AND reply.deleted_at IS NULL
`

function mapPost(row) {
  return {
    id: row.id,
    body: row.body,
    author: {
      id: row.author_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url || null
    },
    parentPostId: row.parent_post_id,
    channelId: row.channel_id,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likeCount: Number(row.like_count),
    replyCount: Number(row.reply_count),
    liked: Boolean(row.liked),
    following: Boolean(row.following)
  }
}

async function selectPosts({ viewerId, where, replacements, limit, order = 'DESC', transaction }) {
  const rows = await sequelize.query(`
    ${postSelect}
    WHERE ${where}
    GROUP BY p.id, u.id, pr.user_id
    ORDER BY p.created_at ${order}, p.id ${order}
    LIMIT :limit
  `, {
    replacements: { viewerId, limit, ...replacements },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })

  return rows.map(mapPost)
}

export async function listPosts(viewerId, { cursor, limit }) {
  const where = [
    "p.deleted_at IS NULL",
    "p.visibility = 'public'"
  ]
  const replacements = {}

  if (cursor) {
    where.push('(p.created_at, p.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }

  const rows = await selectPosts({
    viewerId,
    where: where.join(' AND '),
    replacements,
    limit: limit + 1
  })
  const hasMore = rows.length > limit
  const posts = hasMore ? rows.slice(0, limit) : rows
  const last = posts.at(-1)

  return {
    posts,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
  }
}

export async function getPostById(viewerId, postId, transaction) {
  const posts = await selectPosts({
    viewerId,
    where: "p.id = :postId AND p.deleted_at IS NULL AND p.visibility = 'public'",
    replacements: { postId },
    limit: 1,
    transaction
  })
  const post = posts[0]

  if (!post) {
    throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
  }

  const replies = await selectPosts({
    viewerId,
    where: "p.parent_post_id = :parentPostId AND p.deleted_at IS NULL AND p.visibility = 'public'",
    replacements: { parentPostId: postId },
    limit: 100,
    order: 'ASC',
    transaction
  })

  return { ...post, replies }
}

export async function createPost(authorId, input) {
  const postId = await withTransaction(async transaction => {
    if (input.parentPostId) {
      const parent = await sequelize.query(
        'SELECT id FROM posts WHERE id = :id AND deleted_at IS NULL LIMIT 1',
        {
          replacements: { id: input.parentPostId },
          type: QueryTypes.SELECT,
          transaction
        }
      )
      if (!parent[0]) throw new HttpError(400, 'PARENT_POST_NOT_FOUND', 'Parent post not found')
    }

    if (input.channelId) {
      const channel = await sequelize.query(
        "SELECT id FROM channels WHERE id = :id AND deleted_at IS NULL LIMIT 1",
        {
          replacements: { id: input.channelId },
          type: QueryTypes.SELECT,
          transaction
        }
      )
      if (!channel[0]) throw new HttpError(400, 'CHANNEL_NOT_FOUND', 'Channel not found')
    }

    const rows = await sequelize.query(`
      INSERT INTO posts (author_id, parent_post_id, channel_id, body, visibility)
      VALUES (:authorId, :parentPostId, :channelId, :body, :visibility)
      RETURNING id
    `, {
      replacements: {
        authorId,
        parentPostId: input.parentPostId || null,
        channelId: input.channelId || null,
        body: input.body,
        visibility: input.visibility
      },
      type: QueryTypes.SELECT,
      transaction
    })

    return rows[0].id
  })

  return getPostById(authorId, postId)
}

export async function deletePost(authorId, postId) {
  const rows = await sequelize.query(`
    UPDATE posts
    SET deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = :postId AND author_id = :authorId AND deleted_at IS NULL
    RETURNING id
  `, {
    replacements: { authorId, postId },
    type: QueryTypes.SELECT
  })

  if (!rows[0]) {
    throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
  }

  return { id: rows[0].id }
}
