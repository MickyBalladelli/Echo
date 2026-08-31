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
    }
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

async function searchUsers(query, { cursor, limit }) {
  const replacements = { pattern: `%${query}%` }
  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.created_at, p.display_name, p.bio, p.avatar_url
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND u.status = 'active'
      AND (u.username ILIKE :pattern OR p.display_name ILIKE :pattern OR p.bio ILIKE :pattern)
      ${cursorWhere(cursor, replacements)}
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  return pageRows(rows, limit, mapUser)
}

async function searchChannels(query, { cursor, limit }) {
  const replacements = { pattern: `%${query}%` }
  const rows = await sequelize.query(`
    SELECT c.id, c.name, c.slug, c.description, c.created_at,
      COUNT(DISTINCT members.user_id)::INTEGER AS member_count,
      COUNT(DISTINCT posts.id)::INTEGER AS post_count
    FROM channels c
    LEFT JOIN channel_members members ON members.channel_id = c.id AND members.left_at IS NULL
    LEFT JOIN posts ON posts.channel_id = c.id AND posts.deleted_at IS NULL
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

async function searchHashtags(query, { cursor, limit }) {
  const replacements = { pattern: `%${query.toLowerCase()}%` }
  const rows = await sequelize.query(`
    SELECT h.id, h.tag, h.created_at, COUNT(DISTINCT ph.post_id)::INTEGER AS post_count
    FROM hashtags h
    LEFT JOIN post_hashtags ph ON ph.hashtag_id = h.id
    WHERE h.tag ILIKE :pattern
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
  if (type === 'users') return searchUsers(query, options)
  if (type === 'channels') return searchChannels(query, options)
  if (type === 'hashtags') return searchHashtags(query.replace(/^#/, ''), options)

  const result = await listPosts(viewerId, { ...options, searchQuery: query })
  return { items: result.posts, nextCursor: result.nextCursor }
}

export async function explorePosts(viewerId, sort, { cursor, limit }) {
  if (sort === 'popular') {
    return { posts: await listPopularPosts(viewerId, limit), nextCursor: null }
  }
  return listPosts(viewerId, { cursor, limit })
}
