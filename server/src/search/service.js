import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'
import { encodeCursor } from '../http/pagination.js'
import { listPopularPosts, listPosts } from '../posts/service.js'

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    profile: {
      displayName: row.display_name || row.username,
      bio: row.bio || '',
      avatarUrl: row.avatar_url || null
    },
    mutualCount: Number(row.mutual_count || 0)
  }
}

function mapChannel(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
    memberCount: Number(row.member_count),
    postCount: Number(row.post_count)
  }
}

function mapHashtag(row) {
  return {
    id: row.id,
    tag: row.tag,
    createdAt: row.created_at,
    postCount: Number(row.post_count)
  }
}

function cursorWhere(cursor, replacements, column = 'u') {
  if (!cursor) return ''
  replacements.cursorCreatedAt = cursor.createdAt
  replacements.cursorId = cursor.id
  return `AND (${column}.created_at, ${column}.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))`
}

async function searchUsers(viewerId, query, { cursor, limit }) {
  const replacements = { pattern: `%${query}%`, viewerId }
  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.created_at, p.display_name, p.bio, p.avatar_url,
      (
        SELECT COUNT(DISTINCT viewer_follow.following_id)::INTEGER
        FROM follows viewer_follow
        JOIN follows candidate_follow ON candidate_follow.following_id = viewer_follow.following_id
        WHERE viewer_follow.follower_id = :viewerId AND candidate_follow.follower_id = u.id
      ) AS mutual_count
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND u.status = 'active'
      AND (u.username ILIKE :pattern OR p.display_name ILIKE :pattern OR p.bio ILIKE :pattern)
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks blocked
        WHERE (blocked.blocker_id = :viewerId AND blocked.blocked_id = u.id)
           OR (blocked.blocker_id = u.id AND blocked.blocked_id = :viewerId)
      )
      ${cursorWhere(cursor, replacements)}
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  return pageRows(rows, limit, mapUser)
}

async function searchChannels(viewerId, query, { cursor, limit }) {
  const replacements = { pattern: `%${query}%`, viewerId }
  const rows = await sequelize.query(`
    SELECT c.id, c.name, c.slug, c.description, c.created_at,
      COUNT(DISTINCT members.user_id)::INTEGER AS member_count,
      COUNT(DISTINCT posts.id)::INTEGER AS post_count
    FROM channels c
    JOIN users channel_owner ON channel_owner.id = c.owner_id
      AND channel_owner.deleted_at IS NULL AND channel_owner.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks owner_block
        WHERE (owner_block.blocker_id = :viewerId AND owner_block.blocked_id = channel_owner.id)
           OR (owner_block.blocker_id = channel_owner.id AND owner_block.blocked_id = :viewerId)
      )
    LEFT JOIN channel_members members ON members.channel_id = c.id AND members.left_at IS NULL
    LEFT JOIN posts ON posts.channel_id = c.id AND posts.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks blocked_post_author
        WHERE (blocked_post_author.blocker_id = :viewerId AND blocked_post_author.blocked_id = posts.author_id)
           OR (blocked_post_author.blocker_id = posts.author_id AND blocked_post_author.blocked_id = :viewerId)
      )
    WHERE c.deleted_at IS NULL
      AND c.visibility = 'public'
      AND (c.name ILIKE :pattern OR c.slug ILIKE :pattern OR c.description ILIKE :pattern)
      ${cursorWhere(cursor, replacements, 'c')}
    GROUP BY c.id
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  return pageRows(rows, limit, mapChannel)
}

async function searchHashtags(viewerId, query, { cursor, limit }) {
  const replacements = { pattern: `%${query.toLowerCase()}%`, viewerId }
  const rows = await sequelize.query(`
    SELECT h.id, h.tag, h.created_at, COUNT(DISTINCT tagged_post.id)::INTEGER AS post_count
    FROM hashtags h
    LEFT JOIN post_hashtags ph ON ph.hashtag_id = h.id
    LEFT JOIN posts tagged_post ON tagged_post.id = ph.post_id AND tagged_post.deleted_at IS NULL
    WHERE h.tag ILIKE :pattern
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks blocked_tag_author
        WHERE (blocked_tag_author.blocker_id = :viewerId AND blocked_tag_author.blocked_id = tagged_post.author_id)
           OR (blocked_tag_author.blocker_id = tagged_post.author_id AND blocked_tag_author.blocked_id = :viewerId)
      )
      ${cursorWhere(cursor, replacements, 'h')}
    GROUP BY h.id
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  return pageRows(rows, limit, mapHashtag)
}

function pageRows(rows, limit, mapper) {
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)
  return {
    items: page.map(mapper),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  }
}

export async function search(viewerId, query, type, options) {
  if (type === 'users') return searchUsers(viewerId, query, options)
  if (type === 'channels') return searchChannels(viewerId, query, options)
  if (type === 'hashtags') return searchHashtags(viewerId, query.replace(/^#/, ''), options)

  const result = await listPosts(viewerId, { ...options, searchQuery: query })
  return { items: result.posts, nextCursor: result.nextCursor }
}

export async function explorePosts(viewerId, sort, { cursor, limit }) {
  if (sort === 'popular') {
    return { posts: await listPopularPosts(viewerId, limit), nextCursor: null }
  }
  return listPosts(viewerId, { cursor, limit })
}
