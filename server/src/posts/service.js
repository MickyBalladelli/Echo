import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'

export const MAX_REPLY_DEPTH = 3
const MAX_THREAD_REPLIES = 500

const postSelect = (extraSelect = '') => `
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
  transaction,
  withClause = '',
  extraFrom = '',
  extraSelect = '',
  extraGroupBy = ''
}) {
  const rows = await sequelize.query(`
    ${withClause}
    ${postSelect(extraSelect)}
    ${extraFrom}
    WHERE ${where}
    GROUP BY p.id, u.id, pr.user_id${extraGroupBy ? `, ${extraGroupBy}` : ''}
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
          AND p.visibility = 'public'

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
          AND child.visibility = 'public'
          AND reply_tree.depth < :maxReplyDepth
          AND NOT child.id = ANY(reply_tree.path)
      )
    `,
    extraFrom: 'JOIN reply_tree ON reply_tree.id = p.id',
    extraSelect: ', reply_tree.depth AS reply_depth',
    extraGroupBy: 'reply_tree.depth',
    where: "p.deleted_at IS NULL AND p.visibility = 'public'",
    replacements: {
      rootPostId: postId,
      maxReplyDepth: MAX_REPLY_DEPTH
    },
    limit: MAX_THREAD_REPLIES,
    order: 'ASC',
    transaction
  })
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

  const replies = await listThreadReplies(viewerId, postId, transaction)

  return { ...post, replies }
}

export async function createPost(authorId, input) {
  const postId = await withTransaction(async transaction => {
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
      INSERT INTO posts (author_id, channel_id, body, visibility)
      VALUES (:authorId, :channelId, :body, :visibility)
      RETURNING id
    `, {
      replacements: {
        authorId,
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

export async function createReply(authorId, parentPostId, input) {
  const reply = await withTransaction(async transaction => {
    const parentRows = await sequelize.query(`
      SELECT p.id, p.author_id
      FROM posts p
      JOIN users u ON u.id = p.author_id AND u.deleted_at IS NULL AND u.status = 'active'
      WHERE p.id = :parentPostId
        AND p.deleted_at IS NULL
        AND p.visibility = 'public'
      LIMIT 1
    `, {
      replacements: { parentPostId },
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

    const replyRows = await sequelize.query(`
      INSERT INTO posts (author_id, parent_post_id, body, visibility)
      VALUES (:authorId, :parentPostId, :body, 'public')
      RETURNING id
    `, {
      replacements: { authorId, parentPostId, body: input.body },
      type: QueryTypes.SELECT,
      transaction
    })
    const replyId = replyRows[0].id

    if (parent.author_id !== authorId) {
      await sequelize.query(`
        INSERT INTO notifications (recipient_id, actor_id, type, post_id, payload)
        VALUES (:recipientId, :actorId, 'reply', :postId, CAST(:payload AS JSONB))
      `, {
        replacements: {
          recipientId: parent.author_id,
          actorId: authorId,
          postId: parentPostId,
          payload: JSON.stringify({ replyId, parentPostId })
        },
        transaction
      })
    }

    return { replyId, depth: parentDepth + 1 }
  })

  const rows = await selectPosts({
    viewerId: authorId,
    where: 'p.id = :replyId AND p.deleted_at IS NULL AND p.visibility = \'public\'',
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
      AND posts.visibility = 'public'
    GROUP BY posts.id
  `, {
    replacements: { userId, postId },
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
        AND p.visibility = 'public'
      LIMIT 1
    `, {
      replacements: { postId },
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

    if (insertedRows[0] && post.author_id !== userId) {
      await sequelize.query(`
        INSERT INTO notifications (recipient_id, actor_id, type, post_id, payload)
        VALUES (:recipientId, :actorId, 'like', :postId, CAST(:payload AS JSONB))
      `, {
        replacements: {
          recipientId: post.author_id,
          actorId: userId,
          postId,
          payload: JSON.stringify({ postId })
        },
        transaction
      })
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
