import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { createPost } from '../posts/service.js'

function mapNote(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags: row.tags || [],
    visibility: row.visibility,
    isArchived: Boolean(row.is_archived),
    isPinned: Boolean(row.is_pinned),
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerId: row.user_id,
    canEdit: Boolean(row.can_edit)
  }
}

function encodeNoteCursor(note) {
  return Buffer.from(JSON.stringify({
    updatedAt: new Date(note.updated_at).toISOString(),
    id: note.id,
    isPinned: Boolean(note.is_pinned)
  })).toString('base64url')
}

export function decodeNoteCursor(value) {
  if (!value) return null
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof cursor.updatedAt !== 'string' || typeof cursor.id !== 'string' || typeof cursor.isPinned !== 'boolean') throw new Error()
    if (Number.isNaN(new Date(cursor.updatedAt).getTime())) throw new Error()
    return cursor
  } catch {
    throw new HttpError(400, 'INVALID_CURSOR', 'Invalid notes cursor')
  }
}

async function findNote(viewerId, noteId, { ownerOnly = false } = {}) {
  const rows = await sequelize.query(`
    SELECT note.*, (note.user_id = :viewerId) AS can_edit
    FROM notes note
    WHERE note.id = :noteId AND note.deleted_at IS NULL
      AND (${ownerOnly ? 'note.user_id = :viewerId' : "note.user_id = :viewerId OR note.visibility = 'shared'"})
    LIMIT 1
  `, { replacements: { viewerId, noteId }, type: QueryTypes.SELECT })
  if (!rows[0]) throw new HttpError(404, 'NOTE_NOT_FOUND', 'Note not found')
  return rows[0]
}

export async function getNote(viewerId, noteId) {
  return mapNote(await findNote(viewerId, noteId))
}

export async function listNotes(userId, { cursor, limit, q, tag, archived }) {
  const where = ['note.user_id = :userId', 'note.deleted_at IS NULL', 'note.is_archived = :archived']
  const replacements = { userId, archived: archived === 'true' }
  if (q) {
    where.push(`(note.title ILIKE :pattern OR note.body ILIKE :pattern OR array_to_string(note.tags, ' ') ILIKE :pattern)`)
    replacements.pattern = `%${q}%`
  }
  if (tag) {
    where.push(':tag = ANY(note.tags)')
    replacements.tag = tag
  }
  if (cursor) {
    where.push(`(note.is_pinned, note.updated_at, note.id) <
      (:cursorPinned, CAST(:cursorUpdatedAt AS timestamptz), CAST(:cursorId AS uuid))`)
    replacements.cursorPinned = cursor.isPinned
    replacements.cursorUpdatedAt = cursor.updatedAt
    replacements.cursorId = cursor.id
  }
  const rows = await sequelize.query(`
    SELECT note.*, TRUE AS can_edit
    FROM notes note
    WHERE ${where.join(' AND ')}
    ORDER BY note.is_pinned DESC, note.updated_at DESC, note.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)
  return {
    notes: page.map(mapNote),
    nextCursor: hasMore && last ? encodeNoteCursor(last) : null
  }
}

export async function createNote(userId, input) {
  const rows = await sequelize.query(`
    INSERT INTO notes (user_id, title, body, tags, visibility)
    VALUES (:userId, :title, :body, CAST(:tags AS TEXT[]), :visibility)
    RETURNING *, TRUE AS can_edit
  `, {
    replacements: { ...input, userId, tags: [...new Set(input.tags)] },
    type: QueryTypes.SELECT
  })
  return mapNote(rows[0])
}

export async function updateNote(userId, noteId, input) {
  const current = await findNote(userId, noteId, { ownerOnly: true })
  const values = {
    title: input.title ?? current.title,
    body: input.body ?? current.body,
    tags: [...new Set(input.tags ?? current.tags)],
    visibility: input.visibility ?? current.visibility,
    isArchived: input.isArchived ?? current.is_archived,
    isPinned: input.isPinned ?? current.is_pinned
  }
  const rows = await sequelize.query(`
    UPDATE notes SET title = :title, body = :body, tags = CAST(:tags AS TEXT[]),
      visibility = :visibility, is_archived = :isArchived, is_pinned = :isPinned,
      version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = :noteId AND user_id = :userId AND deleted_at IS NULL AND version = :expectedVersion
    RETURNING *, TRUE AS can_edit
  `, {
    replacements: { ...values, noteId, userId, expectedVersion: input.expectedVersion },
    type: QueryTypes.SELECT
  })
  if (!rows[0]) {
    const latest = await findNote(userId, noteId, { ownerOnly: true })
    throw new HttpError(409, 'NOTE_CONFLICT', 'Note changed in another tab or device', {
      currentVersion: Number(latest.version),
      updatedAt: latest.updated_at
    })
  }
  return mapNote(rows[0])
}

export async function deleteNote(userId, noteId, expectedVersion) {
  const rows = await sequelize.query(`
    UPDATE notes SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1
    WHERE id = :noteId AND user_id = :userId AND deleted_at IS NULL AND version = :expectedVersion
    RETURNING id
  `, { replacements: { noteId, userId, expectedVersion }, type: QueryTypes.SELECT })
  if (!rows[0]) {
    await findNote(userId, noteId, { ownerOnly: true })
    throw new HttpError(409, 'NOTE_CONFLICT', 'Note changed in another tab or device')
  }
  return { id: rows[0].id }
}

export async function publishNote(userId, noteId) {
  const note = await findNote(userId, noteId, { ownerOnly: true })
  const body = note.body.trim() || note.title.trim()
  if (!body) throw new HttpError(400, 'EMPTY_NOTE', 'Write something before publishing')
  if (body.length > 280) throw new HttpError(400, 'NOTE_TOO_LONG_TO_PUBLISH', 'Published note must be 280 characters or less')
  return createPost(userId, { body, channelId: null, visibility: 'public' })
}
