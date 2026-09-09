import { QueryTypes } from 'sequelize'
import { asJsonArray } from '../db/dialect.js'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'
import { inspectContent } from '../moderation/signals.js'
import { notifyChannelMentions } from '../notifications/service.js'
import { publishRealtimeEvent } from '../realtime/events.js'
import { roomName } from '../realtime/rooms.js'
import { isPostgres } from '../db/dialect.js'

const maxAttachmentBytes = 1024 * 1024
const maxAttachmentCount = 3
const maxAttachmentTotalBytes = 1024 * 1024
const attachmentDataPattern = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/

async function requireMember(userId, channelId, transaction) {
  const rows = await sequelize.query(`
    SELECT channel.id, channel.slug, member.role
    FROM channels channel
    JOIN channel_members member ON member.channel_id = channel.id
      AND member.user_id = :userId AND member.left_at IS NULL
    WHERE channel.id = :channelId AND channel.deleted_at IS NULL
    LIMIT 1
  `, { replacements: { userId, channelId }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) })
  if (!rows[0]) throw new HttpError(403, 'CHANNEL_MEMBERSHIP_REQUIRED', 'Join the channel to use chat')
  return rows[0]
}

function parseReactions(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mapReactions(value, currentUserId) {
  const grouped = new Map()
  for (const reaction of parseReactions(value)) {
    if (!reaction?.userId || !reaction.type || !reaction.value) continue
    const key = `${reaction.type}:${reaction.value}`
    const current = grouped.get(key) || {
      type: reaction.type,
      value: reaction.value,
      label: reaction.label || reaction.value,
      count: 0,
      reacted: false
    }
    current.count += 1
    current.reacted = current.reacted || reaction.userId === currentUserId
    grouped.set(key, current)
  }
  return [...grouped.values()]
}

function mapMessage(row, currentUserId) {
  const attachments = Array.isArray(row.attachments)
    ? row.attachments
    : typeof row.attachments === 'string' ? JSON.parse(row.attachments) : []

  return {
    id: row.id,
    channelId: row.channel_id,
    body: row.body,
    attachments,
    reactions: mapReactions(row.reactions, currentUserId),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    sender: {
      id: row.sender_id,
      username: row.username,
      role: row.global_role || 'user',
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url || null,
      chatMarker: row.chat_marker || '🎈',
      badges: asJsonArray(row.sender_badges)
    }
  }
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length > maxAttachmentCount) {
    throw new HttpError(400, 'INVALID_ATTACHMENTS', 'Too many attachments')
  }

  let totalBytes = 0
  return attachments.map(attachment => {
    const match = attachmentDataPattern.exec(attachment.data)
    if (!match) throw new HttpError(400, 'INVALID_ATTACHMENT', 'Attachment data is invalid')

    const data = Buffer.from(match[2], 'base64')
    const size = data.byteLength
    if (size !== attachment.size || size > maxAttachmentBytes) {
      throw new HttpError(400, 'INVALID_ATTACHMENT', 'Attachment size is invalid')
    }

    totalBytes += size
    if (totalBytes > maxAttachmentTotalBytes) {
      throw new HttpError(400, 'ATTACHMENTS_TOO_LARGE', 'Attachments are too large')
    }

    return {
      name: attachment.name.replace(/[\\/]/g, '_'),
      type: attachment.type,
      size,
      data: attachment.data
    }
  })
}

export async function listChannelChatMessages(userId, channelId, { cursor, limit }) {
  await requireMember(userId, channelId)
  const replacements = { channelId, userId, limit: limit + 1 }
  const where = ['message.channel_id = :channelId', 'message.deleted_at IS NULL']
  if (cursor) {
    where.push('(message.created_at, message.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }
  const rows = await sequelize.query(`
    SELECT message.*, sender.username, sender.global_role, profile.display_name, profile.avatar_url, profile.chat_marker,
      COALESCE((
        SELECT jsonb_agg(badge.badge_type ORDER BY CASE badge.badge_type WHEN 'verified' THEN 0 WHEN 'government' THEN 1 WHEN 'business' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END)
        FROM user_badges badge
        WHERE badge.user_id = sender.id AND badge.revoked_at IS NULL
      ), '[]'::JSONB) AS sender_badges
    FROM channel_chat_messages message
    JOIN users sender ON sender.id = message.sender_id AND sender.deleted_at IS NULL
    LEFT JOIN profiles profile ON profile.user_id = sender.id
    WHERE ${where.join(' AND ')}
      AND message.moderation_status IN ('active', 'flagged', 'appeal_accepted')
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks blocked
        WHERE (blocked.blocker_id = :userId AND blocked.blocked_id = message.sender_id)
           OR (blocked.blocker_id = message.sender_id AND blocked.blocked_id = :userId)
      )
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT :limit
  `, { replacements, type: QueryTypes.SELECT })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)
  return {
    messages: page.map(message => mapMessage(message, userId)).reverse(),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  }
}

export async function sendChannelChatMessage(userId, channelId, body, attachments = []) {
  const normalizedAttachments = normalizeAttachments(attachments)
  if (!String(body || '').trim() && !normalizedAttachments.length) {
    throw new HttpError(400, 'EMPTY_MESSAGE', 'Message or attachment is required')
  }

  const message = await withTransaction(async transaction => {
    await requireMember(userId, channelId, transaction)
    const signal = await inspectContent({ userId, action: 'channel_message', body, transaction })
    const rows = await sequelize.query(`
      INSERT INTO channel_chat_messages (channel_id, sender_id, body, attachments, moderation_status)
      VALUES (:channelId, :userId, :body, CAST(:attachments AS JSONB), :moderationStatus)
      RETURNING id
    `, {
      replacements: {
        channelId,
        userId,
        body: String(body || '').trim(),
        attachments: JSON.stringify(normalizedAttachments),
        moderationStatus: signal.flagged ? 'flagged' : 'active'
      },
      type: QueryTypes.SELECT,
      transaction
    })
    const result = await sequelize.query(`
      SELECT message.*, sender.username, sender.global_role, profile.display_name, profile.avatar_url, profile.chat_marker,
        COALESCE((
          SELECT jsonb_agg(badge.badge_type ORDER BY CASE badge.badge_type WHEN 'verified' THEN 0 WHEN 'government' THEN 1 WHEN 'business' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END)
          FROM user_badges badge
          WHERE badge.user_id = sender.id AND badge.revoked_at IS NULL
        ), '[]'::JSONB) AS sender_badges
      FROM channel_chat_messages message
      JOIN users sender ON sender.id = message.sender_id
      LEFT JOIN profiles profile ON profile.user_id = sender.id
      WHERE message.id = :messageId
      LIMIT 1
    `, { replacements: { messageId: rows[0].id }, type: QueryTypes.SELECT, transaction })
    const message = mapMessage(result[0], userId)
    await notifyChannelMentions({
      channelId,
      actorId: userId,
      body,
      messageId: message.id,
      membersOnly: true
    }, transaction)
    return message
  })
  publishRealtimeEvent(roomName('channel', channelId), 'channel:chat:message', message, `channel-chat:${message.id}`)
  return message
}

export async function toggleChannelChatMessageReaction(userId, channelId, messageId, reaction) {
  const message = await withTransaction(async transaction => {
    await requireMember(userId, channelId, transaction)
    const rows = await sequelize.query(`
      SELECT sender_id, reactions
      FROM channel_chat_messages
      WHERE id = :messageId
        AND channel_id = :channelId
        AND deleted_at IS NULL
        AND moderation_status IN ('active', 'flagged', 'appeal_accepted')
      LIMIT 1
      ${isPostgres() ? 'FOR UPDATE' : ''}
    `, {
      replacements: { channelId, messageId },
      type: QueryTypes.SELECT,
      transaction
    })
    if (!rows[0]) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
    if (reaction.type !== 'emoji' && rows[0].sender_id !== userId) {
      throw new HttpError(403, 'MESSAGE_OWNER_REQUIRED', 'Only the message owner can add GIFs or stickers')
    }

    const storedReactions = parseReactions(rows[0].reactions)
    const reactionIndex = storedReactions.findIndex(item => item.userId === userId &&
      item.type === reaction.type && item.value === reaction.value)
    const nextReactions = reactionIndex >= 0
      ? storedReactions.filter((_, index) => index !== reactionIndex)
      : [...storedReactions, { ...reaction, userId }]

    await sequelize.query(`
      UPDATE channel_chat_messages
      SET reactions = CAST(:reactions AS JSONB), updated_at = CURRENT_TIMESTAMP
      WHERE id = :messageId AND channel_id = :channelId
    `, {
      replacements: {
        channelId,
        messageId,
        reactions: JSON.stringify(nextReactions)
      },
      transaction
    })

    const updatedRows = await sequelize.query(`
      SELECT message.*, sender.username, sender.global_role, profile.display_name, profile.avatar_url, profile.chat_marker,
        COALESCE((
          SELECT jsonb_agg(badge.badge_type ORDER BY CASE badge.badge_type WHEN 'verified' THEN 0 WHEN 'government' THEN 1 WHEN 'business' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END)
          FROM user_badges badge
          WHERE badge.user_id = sender.id AND badge.revoked_at IS NULL
        ), '[]'::JSONB) AS sender_badges
      FROM channel_chat_messages message
      JOIN users sender ON sender.id = message.sender_id
      LEFT JOIN profiles profile ON profile.user_id = sender.id
      WHERE message.id = :messageId
      LIMIT 1
    `, { replacements: { messageId }, type: QueryTypes.SELECT, transaction })
    return mapMessage(updatedRows[0], userId)
  })

  publishRealtimeEvent(
    roomName('channel', channelId),
    'channel:chat:message:updated',
    { ...message, reactionActorId: userId },
    `channel-chat-reaction:${message.id}:${userId}:${Date.now()}`
  )
  return message
}

export async function markChannelChatRead(userId, channelId, messageId) {
  await withTransaction(async transaction => {
    await requireMember(userId, channelId, transaction)
    await sequelize.query(`
      INSERT INTO channel_chat_read_states (channel_id, user_id, last_read_message_id)
      VALUES (:channelId, :userId, :messageId)
      ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, last_read_at = CURRENT_TIMESTAMP
    `, { replacements: { channelId, userId, messageId }, transaction })
  })
  return { channelId, messageId, read: true }
}
