import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'
import { emitNotification } from './realtime.js'

export const notificationTypes = Object.freeze({
  reply: 'reply',
  like: 'like',
  follow: 'follow',
  channelInvite: 'channel_invite',
  channelJoin: 'channel_join',
  chatMessage: 'chat_message'
})

function notificationHref(row) {
  if (row.post_id) return `/posts/${row.post_id}`
  if (row.type === notificationTypes.follow && row.actor_username) return `/users/${row.actor_username}`
  if (row.channel_slug) return `/channels/${row.channel_slug}`
  if (row.conversation_id) return '/chat'
  return '/notifications'
}

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    postId: row.post_id || null,
    channelId: row.channel_id || null,
    conversationId: row.conversation_id || null,
    payload: row.payload || {},
    readAt: row.read_at || null,
    createdAt: row.created_at,
    href: notificationHref(row),
    actor: row.actor_id
      ? {
        id: row.actor_id,
        username: row.actor_username,
        displayName: row.actor_display_name || row.actor_username,
        avatarUrl: row.actor_avatar_url || null
      }
      : null
  }
}

export async function getUnreadCount(recipientId, transaction) {
  const rows = await sequelize.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM notifications
    WHERE recipient_id = :recipientId AND read_at IS NULL
      AND (actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_blocks hidden_block
        WHERE (hidden_block.blocker_id = :recipientId AND hidden_block.blocked_id = notifications.actor_id)
           OR (hidden_block.blocker_id = notifications.actor_id AND hidden_block.blocked_id = :recipientId)
      ))
      AND (actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_mutes hidden_mute
        WHERE hidden_mute.user_id = :recipientId AND hidden_mute.muted_user_id = notifications.actor_id
      ))
  `, {
    replacements: { recipientId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  return Number(rows[0]?.count || 0)
}

export async function createNotification({
  recipientId,
  actorId = null,
  type,
  postId = null,
  channelId = null,
  conversationId = null,
  payload = {},
  dedupeKey
}, transaction) {
  if (actorId && recipientId === actorId) return null

  if (actorId) {
    const hidden = await sequelize.query(`
      SELECT 1
      FROM user_blocks hidden_block
      WHERE (hidden_block.blocker_id = :recipientId AND hidden_block.blocked_id = :actorId)
         OR (hidden_block.blocker_id = :actorId AND hidden_block.blocked_id = :recipientId)
      UNION ALL
      SELECT 1 FROM user_mutes hidden_mute
      WHERE hidden_mute.user_id = :recipientId AND hidden_mute.muted_user_id = :actorId
      LIMIT 1
    `, {
      replacements: { recipientId, actorId },
      type: QueryTypes.SELECT,
      ...(transaction ? { transaction } : {})
    })
    if (hidden[0]) return null
  }

  const rows = await sequelize.query(`
    INSERT INTO notifications (
      recipient_id, actor_id, type, post_id, channel_id, conversation_id, payload, dedupe_key
    )
    VALUES (
      :recipientId, :actorId, :type, :postId, :channelId, :conversationId,
      CAST(:payload AS JSONB), :dedupeKey
    )
    ON CONFLICT (recipient_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id
  `, {
    replacements: {
      recipientId,
      actorId,
      type,
      postId,
      channelId,
      conversationId,
      payload: JSON.stringify(payload),
      dedupeKey
    },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  const notification = rows[0]
  if (!notification) return null

  const publish = () => getUnreadCount(recipientId)
    .then(unreadCount => emitNotification(recipientId, { id: notification.id, unreadCount }))
    .catch(() => {})

  if (transaction) transaction.afterCommit(publish)
  else await publish()
  return notification
}

export function notifyReply({ recipientId, actorId, postId, replyId }, transaction) {
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.reply,
    postId,
    payload: { replyId, parentPostId: postId },
    dedupeKey: `reply:${replyId}`
  }, transaction)
}

export function notifyLike({ recipientId, actorId, postId }, transaction) {
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.like,
    postId,
    payload: { postId },
    dedupeKey: `post:${postId}:actor:${actorId}`
  }, transaction)
}

export function notifyFollow({ recipientId, actorId }, transaction) {
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.follow,
    payload: { userId: actorId },
    dedupeKey: `actor:${actorId}`
  }, transaction)
}

export function notifyChannelInvite({ recipientId, actorId, channelId }, transaction) {
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.channelInvite,
    channelId,
    payload: { channelId },
    dedupeKey: `channel:${channelId}:actor:${actorId}`
  }, transaction)
}

export function notifyChannelJoin({ recipientId, actorId, channelId }, transaction) {
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.channelJoin,
    channelId,
    payload: { channelId },
    dedupeKey: `channel:${channelId}:actor:${actorId}`
  }, transaction)
}

export function notifyChatMessage({ recipientId, actorId, conversationId, messageId }, transaction) {
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.chatMessage,
    conversationId,
    payload: { messageId },
    dedupeKey: `message:${messageId}`
  }, transaction)
}

export async function listNotifications(recipientId, { cursor, limit }) {
  const where = ['n.recipient_id = :recipientId']
  const replacements = { recipientId }
  if (cursor) {
    where.push('(n.created_at, n.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }

  const rows = await sequelize.query(`
    SELECT n.*, actor.username AS actor_username, profile.display_name AS actor_display_name,
      profile.avatar_url AS actor_avatar_url, channel.slug AS channel_slug
    FROM notifications n
    LEFT JOIN users actor ON actor.id = n.actor_id
    LEFT JOIN profiles profile ON profile.user_id = actor.id
    LEFT JOIN channels channel ON channel.id = n.channel_id AND channel.deleted_at IS NULL
    WHERE ${where.join(' AND ')}
      AND (n.actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_blocks hidden_block
        WHERE (hidden_block.blocker_id = :recipientId AND hidden_block.blocked_id = n.actor_id)
           OR (hidden_block.blocker_id = n.actor_id AND hidden_block.blocked_id = :recipientId)
      ))
      AND (n.actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_mutes hidden_mute
        WHERE hidden_mute.user_id = :recipientId AND hidden_mute.muted_user_id = n.actor_id
      ))
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT :limit
  `, {
    replacements: { ...replacements, limit: limit + 1 },
    type: QueryTypes.SELECT
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)
  return {
    notifications: page.map(mapNotification),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  }
}

export async function markNotificationRead(recipientId, notificationId) {
  const rows = await sequelize.query(`
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE id = :notificationId AND recipient_id = :recipientId
    RETURNING id, read_at
  `, {
    replacements: { recipientId, notificationId },
    type: QueryTypes.SELECT
  })
  if (!rows[0]) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
  return { id: rows[0].id, readAt: rows[0].read_at }
}

export async function markAllNotificationsRead(recipientId) {
  const rows = await sequelize.query(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP
    WHERE recipient_id = :recipientId AND read_at IS NULL
    RETURNING id
  `, {
    replacements: { recipientId },
    type: QueryTypes.SELECT
  })
  return { updatedCount: rows.length }
}
