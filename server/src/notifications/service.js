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
  channelPost: 'channel_post',
  chatMessage: 'chat_message',
  mention: 'mention'
})

export const notificationPreferenceTypes = Object.freeze(Object.values(notificationTypes))
export const NOTIFICATION_RETENTION_DAYS = 90

function notificationGroupKey({ type, recipientId, postId, channelId, conversationId }) {
  if (postId && type === notificationTypes.like) return `post:${postId}:likes`
  if (postId && type === notificationTypes.reply) return `post:${postId}:replies`
  if (channelId && type === notificationTypes.channelPost) return `channel:${channelId}:posts`
  if (channelId && type === notificationTypes.channelInvite) return `channel:${channelId}:invites`
  if (channelId && type === notificationTypes.channelJoin) return `channel:${channelId}:joins`
  if (channelId && type === notificationTypes.mention) return `channel:${channelId}:mentions`
  if (conversationId && type === notificationTypes.chatMessage) return `conversation:${conversationId}:messages`
  if (type === notificationTypes.follow) return `user:${recipientId}:follows`
  return `${type}:${postId || channelId || conversationId || recipientId}`
}

function notificationHref(row) {
  if (row.post_id) return `/posts/${row.post_id}`
  if (row.type === notificationTypes.follow && row.actor_username) return `/users/${row.actor_username}`
  if (row.channel_slug) return `/channels/${row.channel_slug}`
  if (row.conversation_id) return '/chat'
  return '/notifications'
}

function mapNotification(row) {
  const groupedRead = row.group_read === undefined ? Boolean(row.read_at) : Boolean(row.group_read)
  return {
    id: row.id,
    type: row.type,
    postId: row.post_id || null,
    channelId: row.channel_id || null,
    conversationId: row.conversation_id || null,
    payload: row.payload || {},
    readAt: groupedRead ? row.read_at || null : null,
    createdAt: row.created_at,
    groupKey: row.notification_group_key || row.group_key || row.id,
    groupCount: Number(row.group_count || 1),
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

async function purgeExpiredNotifications(recipientId, transaction) {
  await sequelize.query(`
    DELETE FROM notifications
    WHERE recipient_id = :recipientId AND expires_at <= CURRENT_TIMESTAMP
  `, {
    replacements: { recipientId },
    ...(transaction ? { transaction } : {})
  })
}

export async function getUnreadCount(recipientId, transaction) {
  await purgeExpiredNotifications(recipientId, transaction)
  const rows = await sequelize.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM notifications
    WHERE recipient_id = :recipientId AND read_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
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

export async function getNotificationPreferences(userId, transaction) {
  const rows = await sequelize.query(`
    SELECT notification_type, enabled
    FROM user_notification_preferences
    WHERE user_id = :userId
  `, {
    replacements: { userId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  const values = new Map(rows.map(row => [row.notification_type, Boolean(row.enabled)]))
  return notificationPreferenceTypes.map(type => ({
    type,
    enabled: values.get(type) !== false
  }))
}

export async function updateNotificationPreferences(userId, preferences) {
  return sequelize.transaction(async transaction => {
    for (const preference of preferences) {
      await sequelize.query(`
        INSERT INTO user_notification_preferences (user_id, notification_type, enabled)
        VALUES (:userId, :notificationType, :enabled)
        ON CONFLICT (user_id, notification_type) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          updated_at = CURRENT_TIMESTAMP
      `, {
        replacements: {
          userId,
          notificationType: preference.type,
          enabled: preference.enabled
        },
        transaction
      })
    }
    return getNotificationPreferences(userId, transaction)
  })
}

export async function getEmailNotificationPreferences(userId, transaction) {
  const rows = await sequelize.query(`
    SELECT enabled, digest_frequency
    FROM user_email_preferences
    WHERE user_id = :userId
    LIMIT 1
  `, {
    replacements: { userId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  return rows[0]
    ? { enabled: Boolean(rows[0].enabled), digestFrequency: rows[0].digest_frequency }
    : { enabled: false, digestFrequency: 'never' }
}

export async function updateEmailNotificationPreferences(userId, input) {
  const rows = await sequelize.query(`
    INSERT INTO user_email_preferences (user_id, enabled, digest_frequency)
    VALUES (:userId, :enabled, :digestFrequency)
    ON CONFLICT (user_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      digest_frequency = EXCLUDED.digest_frequency,
      updated_at = CURRENT_TIMESTAMP
    RETURNING enabled, digest_frequency
  `, {
    replacements: { userId, ...input },
    type: QueryTypes.SELECT
  })
  return {
    enabled: Boolean(rows[0].enabled),
    digestFrequency: rows[0].digest_frequency
  }
}

export async function createNotification({
  recipientId,
  actorId = null,
  type,
  postId = null,
  channelId = null,
  conversationId = null,
  payload = {},
  dedupeKey,
  groupKey = null
}, transaction) {
  if (actorId && recipientId === actorId) return null

  const preferenceRows = await sequelize.query(`
    SELECT enabled
    FROM user_notification_preferences
    WHERE user_id = :recipientId AND notification_type = :notificationType
    LIMIT 1
  `, {
    replacements: { recipientId, notificationType: type },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  if (preferenceRows[0] && !preferenceRows[0].enabled) return null

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
      recipient_id, actor_id, type, post_id, channel_id, conversation_id, payload, dedupe_key, group_key
    )
    VALUES (
      :recipientId, :actorId, :type, :postId, :channelId, :conversationId,
      CAST(:payload AS JSONB), :dedupeKey, :groupKey
    )
    ON CONFLICT (recipient_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id, type, post_id, channel_id
  `, {
    replacements: {
      recipientId,
      actorId,
      type,
      postId,
      channelId,
      conversationId,
      payload: JSON.stringify(payload),
      dedupeKey,
      groupKey: groupKey || notificationGroupKey({ type, recipientId, postId, channelId, conversationId })
    },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  const notification = rows[0]
  if (!notification) return null

  const publish = () => getUnreadCount(recipientId)
    .then(unreadCount => emitNotification(recipientId, {
      id: notification.id,
      type: notification.type,
      postId: notification.post_id || null,
      channelId: notification.channel_id || null,
      unreadCount
    }))
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

export function notifyChannelPost({ recipientId, actorId, channelId, postId }, transaction) {
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.channelPost,
    postId,
    channelId,
    payload: { postId, channelId },
    dedupeKey: `post:${postId}`
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

export function extractMentionUsernames(body = '') {
  return [...String(body).matchAll(/(^|[^a-z0-9_])@([a-z0-9_]{3,32})(?![a-z0-9_])/gi)]
    .map(match => match[2].toLowerCase())
    .filter((username, index, usernames) => usernames.indexOf(username) === index)
}

export async function notifyChannelMentions({
  channelId,
  actorId,
  body,
  postId = null,
  messageId = null,
  membersOnly = false
}, transaction) {
  const usernames = extractMentionUsernames(body)
  if (!usernames.length) return

  const access = membersOnly
    ? 'member.user_id IS NOT NULL'
    : `(channel.visibility = 'public' OR member.user_id IS NOT NULL)`
  const recipients = await sequelize.query(`
    SELECT tagged_user.id AS user_id
    FROM channels channel
    JOIN users tagged_user ON LOWER(tagged_user.username) IN (:usernames)
      AND tagged_user.deleted_at IS NULL AND tagged_user.status = 'active'
    LEFT JOIN channel_members member ON member.channel_id = channel.id
      AND member.user_id = tagged_user.id AND member.left_at IS NULL
    WHERE channel.id = :channelId AND channel.deleted_at IS NULL
      AND tagged_user.id <> :actorId
      AND ${access}
  `, {
    replacements: { channelId, actorId, usernames },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })

  for (const recipient of recipients) {
    await notifyMention({
      recipientId: recipient.user_id,
      actorId,
      channelId,
      postId,
      messageId
    }, transaction)
  }
}

export async function notifyPostMentions({ authorId, body, postId, visibility = 'public' }, transaction) {
  const usernames = extractMentionUsernames(body)
  if (!usernames.length || visibility === 'private') return

  const visibilityAccess = visibility === 'followers'
    ? `EXISTS (
        SELECT 1 FROM follows mention_follow
        WHERE mention_follow.follower_id = tagged_user.id
          AND mention_follow.following_id = :authorId
      )`
    : 'TRUE'
  const recipients = await sequelize.query(`
    SELECT tagged_user.id AS user_id
    FROM users tagged_user
    WHERE LOWER(tagged_user.username) IN (:usernames)
      AND tagged_user.deleted_at IS NULL AND tagged_user.status = 'active'
      AND tagged_user.id <> :authorId
      AND ${visibilityAccess}
  `, {
    replacements: { authorId, usernames },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })

  for (const recipient of recipients) {
    await notifyMention({ recipientId: recipient.user_id, actorId: authorId, postId }, transaction)
  }
}

export function notifyMention({ recipientId, actorId, channelId, postId = null, messageId = null }, transaction) {
  const contentKey = postId ? `post:${postId}` : `message:${messageId}`
  return createNotification({
    recipientId,
    actorId,
    type: notificationTypes.mention,
    postId,
    channelId,
    payload: { channelId, postId, messageId },
    dedupeKey: contentKey
  }, transaction)
}

export async function listNotifications(recipientId, { cursor, limit }) {
  await purgeExpiredNotifications(recipientId)
  const where = ['n.recipient_id = :recipientId']
  const replacements = { recipientId }
  if (cursor) {
    where.push('(n.created_at, n.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }

  const rows = await sequelize.query(`
    WITH visible_notifications AS (
      SELECT n.*, actor.username AS actor_username, profile.display_name AS actor_display_name,
        profile.avatar_url AS actor_avatar_url, channel.slug AS channel_slug,
        COALESCE(n.group_key, n.id::TEXT) AS notification_group_key,
        COUNT(*) OVER (
          PARTITION BY COALESCE(n.group_key, n.id::TEXT)
        )::INTEGER AS group_count,
        BOOL_AND(n.read_at IS NOT NULL) OVER (
          PARTITION BY COALESCE(n.group_key, n.id::TEXT)
        ) AS group_read
      FROM notifications n
      LEFT JOIN users actor ON actor.id = n.actor_id
      LEFT JOIN profiles profile ON profile.user_id = actor.id
      LEFT JOIN channels channel ON channel.id = n.channel_id AND channel.deleted_at IS NULL
      WHERE ${where.join(' AND ')}
        AND n.expires_at > CURRENT_TIMESTAMP
        AND (n.actor_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM user_blocks hidden_block
          WHERE (hidden_block.blocker_id = :recipientId AND hidden_block.blocked_id = n.actor_id)
             OR (hidden_block.blocker_id = n.actor_id AND hidden_block.blocked_id = :recipientId)
        ))
        AND (n.actor_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM user_mutes hidden_mute
          WHERE hidden_mute.user_id = :recipientId AND hidden_mute.muted_user_id = n.actor_id
        ))
    ), latest_notifications AS (
      SELECT DISTINCT ON (notification_group_key) *
      FROM visible_notifications
      ORDER BY notification_group_key, created_at DESC, id DESC
    )
    SELECT * FROM latest_notifications
    ORDER BY created_at DESC, id DESC
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
      AND expires_at > CURRENT_TIMESTAMP
    RETURNING id, read_at
  `, {
    replacements: { recipientId, notificationId },
    type: QueryTypes.SELECT
  })
  if (!rows[0]) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
  return { id: rows[0].id, readAt: rows[0].read_at }
}

export async function markNotificationGroupRead(recipientId, groupKey) {
  const rows = await sequelize.query(`
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE recipient_id = :recipientId
      AND COALESCE(group_key, id::TEXT) = :groupKey
      AND read_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    RETURNING id
  `, {
    replacements: { recipientId, groupKey },
    type: QueryTypes.SELECT
  })
  if (!rows.length) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
  return { groupKey, updatedCount: rows.length }
}

export async function markAllNotificationsRead(recipientId) {
  await purgeExpiredNotifications(recipientId)
  const rows = await sequelize.query(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP
    WHERE recipient_id = :recipientId AND read_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    RETURNING id
  `, {
    replacements: { recipientId },
    type: QueryTypes.SELECT
  })
  return { updatedCount: rows.length }
}
