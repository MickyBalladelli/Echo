import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { encodeCursor } from '../http/pagination.js'
import { notifyChatMessage } from '../notifications/service.js'
import { publishRealtimeEvent } from '../realtime/events.js'
import { roomName } from '../realtime/rooms.js'
import { inspectContent } from '../moderation/signals.js'
import { reportTarget } from '../moderation/service.js'

function mapMember(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || null,
    role: row.role
  }
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    body: row.deleted_at ? null : row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at || null,
    deletedAt: row.deleted_at || null,
    moderationStatus: row.moderation_status,
    sender: {
      id: row.sender_id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url || null
    },
    readBy: row.read_by || []
  }
}

async function requireMembership(userId, conversationId, transaction) {
  const rows = await sequelize.query(`
    SELECT conversation.id, conversation.kind, conversation.created_by, conversation.title, member.role,
      member.muted_until, member.notifications_enabled
    FROM chat_conversations conversation
    JOIN chat_members member ON member.conversation_id = conversation.id
      AND member.user_id = :userId AND member.left_at IS NULL
    WHERE conversation.id = :conversationId AND conversation.deleted_at IS NULL
    LIMIT 1
  `, {
    replacements: { userId, conversationId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  if (!rows[0]) throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found')
  return rows[0]
}

async function resolveUsers(usernames, transaction) {
  const rows = await sequelize.query(`
    SELECT id, username FROM users
    WHERE LOWER(username) IN (:usernames) AND deleted_at IS NULL AND status = 'active'
  `, { replacements: { usernames }, type: QueryTypes.SELECT, transaction })
  if (rows.length !== new Set(usernames).size) throw new HttpError(404, 'CHAT_USER_NOT_FOUND', 'One or more users not found')
  return rows
}

async function hasBlock(leftId, rightId, transaction) {
  const rows = await sequelize.query(`
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = :leftId AND blocked_id = :rightId)
      OR (blocker_id = :rightId AND blocked_id = :leftId)
    LIMIT 1
  `, { replacements: { leftId, rightId }, type: QueryTypes.SELECT, transaction })
  return Boolean(rows[0])
}

async function hasRestriction(restrictorId, restrictedId, transaction) {
  const rows = await sequelize.query(`
    SELECT 1 FROM user_restrictions
    WHERE user_id = :restrictorId AND restricted_user_id = :restrictedId
    LIMIT 1
  `, { replacements: { restrictorId, restrictedId }, type: QueryTypes.SELECT, transaction })
  return Boolean(rows[0])
}

export async function createConversation(userId, input) {
  return withTransaction(async transaction => {
    const users = await resolveUsers([...new Set(input.usernames)], transaction)
    if (users.some(user => user.id === userId)) throw new HttpError(400, 'INVALID_CHAT_MEMBERS', 'Do not add yourself')
    if (input.kind === 'direct' && (
      await hasBlock(userId, users[0].id, transaction) ||
      await hasRestriction(users[0].id, userId, transaction)
    )) {
      throw new HttpError(403, 'CHAT_BLOCKED', 'Chat is blocked')
    }
    const memberIds = [userId, ...users.map(user => user.id)]
    const directKey = input.kind === 'direct' ? [...memberIds].sort().join(':') : null
    if (directKey) {
      const existing = await sequelize.query(`
        SELECT id FROM chat_conversations WHERE direct_key = :directKey AND deleted_at IS NULL LIMIT 1
      `, { replacements: { directKey }, type: QueryTypes.SELECT, transaction })
      if (existing[0]) return getConversation(userId, existing[0].id, transaction)
    }
    const rows = await sequelize.query(`
      INSERT INTO chat_conversations (created_by, kind, title, direct_key)
      VALUES (:userId, :kind, :title, :directKey) RETURNING id
    `, {
      replacements: { userId, kind: input.kind, title: input.title || null, directKey },
      type: QueryTypes.SELECT,
      transaction
    })
    const conversationId = rows[0].id
    for (const memberId of memberIds) {
      await sequelize.query(`
        INSERT INTO chat_members (conversation_id, user_id, role)
        VALUES (:conversationId, :memberId, :role)
      `, {
        replacements: { conversationId, memberId, role: memberId === userId ? 'owner' : 'member' },
        transaction
      })
      await sequelize.query(`
        INSERT INTO chat_read_states (conversation_id, user_id, last_read_at)
        VALUES (:conversationId, :memberId, CURRENT_TIMESTAMP)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
      `, { replacements: { conversationId, memberId }, transaction })
    }
    return getConversation(userId, conversationId, transaction)
  })
}

export async function getConversation(userId, conversationId, transaction) {
  const membership = await requireMembership(userId, conversationId, transaction)
  const members = await sequelize.query(`
    SELECT u.id, u.username, profile.display_name, profile.avatar_url, member.role
    FROM chat_members member
    JOIN users u ON u.id = member.user_id AND u.deleted_at IS NULL
    LEFT JOIN profiles profile ON profile.user_id = u.id
    WHERE member.conversation_id = :conversationId AND member.left_at IS NULL
      AND (${membership.kind === 'direct' ? 'TRUE' : `NOT EXISTS (
        SELECT 1 FROM user_blocks member_block
        WHERE (member_block.blocker_id = :userId AND member_block.blocked_id = u.id)
           OR (member_block.blocker_id = u.id AND member_block.blocked_id = :userId)
      )`})
    ORDER BY member.joined_at
  `, { replacements: { conversationId, userId }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) })
  const mappedMembers = members.map(mapMember)
  const other = mappedMembers.find(member => member.id !== userId)
  const blocks = other ? await sequelize.query(`
    SELECT
      EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = :userId AND blocked_id = :otherId) AS blocked_by_viewer,
      EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = :otherId AND blocked_id = :userId) AS blocked_viewer
  `, {
    replacements: { userId, otherId: other.id },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  }) : []
  if (membership.kind === 'direct' && blocks[0] && (
    blocks[0].blocked_by_viewer || blocks[0].blocked_viewer
  )) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found')
  }
  return {
    id: membership.id,
    kind: membership.kind,
    title: membership.kind === 'direct' ? other?.displayName || 'Direct chat' : membership.title,
    createdBy: membership.created_by,
    role: membership.role,
    muted: Boolean(membership.muted_until && new Date(membership.muted_until) > new Date()),
    notificationsEnabled: Boolean(membership.notifications_enabled),
    blockedByViewer: Boolean(blocks[0]?.blocked_by_viewer),
    blockedViewer: Boolean(blocks[0]?.blocked_viewer),
    members: mappedMembers
  }
}

export async function listConversations(userId) {
  const rows = await sequelize.query(`
    SELECT conversation.id, conversation.updated_at,
      last_message.body AS last_body, last_message.created_at AS last_message_at,
      COUNT(message.id) FILTER (
        WHERE message.sender_id <> :userId AND message.deleted_at IS NULL
          AND message.moderation_status IN ('active', 'flagged', 'appeal_accepted')
          AND message.created_at > COALESCE(read_state.last_read_at, member.joined_at)
          AND NOT EXISTS (
            SELECT 1 FROM user_blocks unread_block
            WHERE (unread_block.blocker_id = :userId AND unread_block.blocked_id = message.sender_id)
               OR (unread_block.blocker_id = message.sender_id AND unread_block.blocked_id = :userId)
          )
      )::INTEGER AS unread_count
    FROM chat_conversations conversation
    JOIN chat_members member ON member.conversation_id = conversation.id
      AND member.user_id = :userId AND member.left_at IS NULL
    LEFT JOIN chat_read_states read_state ON read_state.conversation_id = conversation.id AND read_state.user_id = :userId
    LEFT JOIN chat_messages message ON message.conversation_id = conversation.id
    LEFT JOIN LATERAL (
      SELECT body, created_at FROM chat_messages latest
      WHERE latest.conversation_id = conversation.id AND latest.deleted_at IS NULL
        AND latest.moderation_status IN ('active', 'flagged', 'appeal_accepted')
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks latest_block
          WHERE (latest_block.blocker_id = :userId AND latest_block.blocked_id = latest.sender_id)
             OR (latest_block.blocker_id = latest.sender_id AND latest_block.blocked_id = :userId)
        )
      ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
    ) last_message ON TRUE
    WHERE conversation.deleted_at IS NULL
      AND (conversation.kind <> 'direct' OR NOT EXISTS (
        SELECT 1
        FROM chat_members other_member
        JOIN user_blocks hidden_block ON (
          (hidden_block.blocker_id = :userId AND hidden_block.blocked_id = other_member.user_id)
          OR (hidden_block.blocker_id = other_member.user_id AND hidden_block.blocked_id = :userId)
        )
        WHERE other_member.conversation_id = conversation.id
          AND other_member.user_id <> :userId
          AND other_member.left_at IS NULL
      ))
    GROUP BY conversation.id, member.joined_at, read_state.last_read_at, last_message.body, last_message.created_at
    ORDER BY COALESCE(last_message.created_at, conversation.updated_at) DESC, conversation.id DESC
  `, { replacements: { userId }, type: QueryTypes.SELECT })
  return Promise.all(rows.map(async row => ({
    ...await getConversation(userId, row.id),
    unreadCount: Number(row.unread_count),
    lastMessage: row.last_body ? { body: row.last_body, createdAt: row.last_message_at } : null
  })))
}

export async function listMessages(userId, conversationId, { cursor, limit }) {
  const conversation = await requireMembership(userId, conversationId)
  if (conversation.kind === 'direct') {
    const others = await sequelize.query(`
      SELECT user_id FROM chat_members
      WHERE conversation_id = :conversationId AND user_id <> :userId AND left_at IS NULL
    `, { replacements: { conversationId, userId }, type: QueryTypes.SELECT })
    if (others[0] && await hasBlock(userId, others[0].user_id)) {
      throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found')
    }
  }
  const where = ['message.conversation_id = :conversationId']
  const replacements = { conversationId, userId }
  if (cursor) {
    where.push('(message.created_at, message.id) < (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))')
    replacements.cursorCreatedAt = cursor.createdAt
    replacements.cursorId = cursor.id
  }
    const rows = await sequelize.query(`
    SELECT message.*, sender.username, profile.display_name, profile.avatar_url,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', reader.id, 'username', reader.username))
        FROM chat_read_states receipt
        JOIN users reader ON reader.id = receipt.user_id
        WHERE receipt.conversation_id = message.conversation_id
          AND receipt.user_id <> message.sender_id AND receipt.last_read_at >= message.created_at
      ), '[]'::JSONB) AS read_by
    FROM chat_messages message
    JOIN users sender ON sender.id = message.sender_id
    LEFT JOIN profiles profile ON profile.user_id = sender.id
    WHERE ${where.join(' AND ')}
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks message_block
        WHERE (message_block.blocker_id = :userId AND message_block.blocked_id = message.sender_id)
           OR (message_block.blocker_id = message.sender_id AND message_block.blocked_id = :userId)
      )
      AND (
        message.moderation_status IN ('active', 'flagged', 'appeal_accepted')
        OR message.sender_id = :userId
        OR EXISTS (
          SELECT 1 FROM users moderation_user
          WHERE moderation_user.id = :userId
            AND moderation_user.global_role IN ('moderator', 'admin')
        )
      )
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT :limit
  `, { replacements: { ...replacements, limit: limit + 1 }, type: QueryTypes.SELECT })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)
  return {
    messages: page.map(mapMessage).reverse(),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  }
}

async function getMessage(messageId, transaction) {
  const rows = await sequelize.query(`
    SELECT message.*, sender.username, profile.display_name, profile.avatar_url, '[]'::JSONB AS read_by
    FROM chat_messages message
    JOIN users sender ON sender.id = message.sender_id
    LEFT JOIN profiles profile ON profile.user_id = sender.id
    WHERE message.id = :messageId LIMIT 1
  `, { replacements: { messageId }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) })
  if (!rows[0]) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
  return mapMessage(rows[0])
}

export async function sendMessage(userId, conversationId, body) {
  return withTransaction(async transaction => {
    const contentSignal = await inspectContent({ userId, action: 'message', body, transaction })
    const moderationStatus = contentSignal.flagged ? 'flagged' : 'active'
    const conversation = await requireMembership(userId, conversationId, transaction)
    if (conversation.kind === 'direct') {
      const others = await sequelize.query(`
        SELECT user_id FROM chat_members
        WHERE conversation_id = :conversationId AND user_id <> :userId AND left_at IS NULL
      `, { replacements: { conversationId, userId }, type: QueryTypes.SELECT, transaction })
      if (others[0] && await hasBlock(userId, others[0].user_id, transaction)) {
        throw new HttpError(403, 'CHAT_BLOCKED', 'Chat is blocked')
      }
      if (others[0] && await hasRestriction(others[0].user_id, userId, transaction)) {
        throw new HttpError(403, 'CHAT_RESTRICTED', 'This user does not accept messages from you')
      }
    }
    const rows = await sequelize.query(`
      INSERT INTO chat_messages (conversation_id, sender_id, body, moderation_status)
      VALUES (:conversationId, :userId, :body, :moderationStatus) RETURNING id
    `, { replacements: { conversationId, userId, body, moderationStatus }, type: QueryTypes.SELECT, transaction })
    const message = await getMessage(rows[0].id, transaction)
    await sequelize.query(`
      UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = :conversationId
    `, { replacements: { conversationId }, transaction })
    const recipients = await sequelize.query(`
      SELECT member.user_id
      FROM chat_members member
      WHERE member.conversation_id = :conversationId AND member.user_id <> :userId
        AND member.left_at IS NULL AND member.notifications_enabled = TRUE
        AND (member.muted_until IS NULL OR member.muted_until < CURRENT_TIMESTAMP)
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks block
          WHERE (block.blocker_id = member.user_id AND block.blocked_id = :userId)
            OR (block.blocker_id = :userId AND block.blocked_id = member.user_id)
        )
    `, { replacements: { conversationId, userId }, type: QueryTypes.SELECT, transaction })
    for (const recipient of recipients) {
      await notifyChatMessage({
        recipientId: recipient.user_id,
        actorId: userId,
        conversationId,
        messageId: message.id
      }, transaction)
    }
    transaction.afterCommit(() => publishRealtimeEvent(
      roomName('conversation', conversationId),
      'chat:message',
      message,
      `chat-message:${message.id}`
    ))
    return message
  })
}

export async function editMessage(userId, messageId, body) {
  const rows = await sequelize.query(`
    UPDATE chat_messages SET body = :body, edited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = :messageId AND sender_id = :userId AND deleted_at IS NULL
    RETURNING conversation_id
  `, { replacements: { userId, messageId, body }, type: QueryTypes.SELECT })
  if (!rows[0]) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
  const message = await getMessage(messageId)
  publishRealtimeEvent(roomName('conversation', rows[0].conversation_id), 'chat:message:updated', message, `chat-edit:${message.id}:${message.editedAt}`)
  return message
}

export async function deleteMessage(userId, messageId) {
  const rows = await sequelize.query(`
    UPDATE chat_messages SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = :messageId AND sender_id = :userId AND deleted_at IS NULL
    RETURNING conversation_id
  `, { replacements: { userId, messageId }, type: QueryTypes.SELECT })
  if (!rows[0]) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
  const message = await getMessage(messageId)
  publishRealtimeEvent(roomName('conversation', rows[0].conversation_id), 'chat:message:deleted', message, `chat-delete:${message.id}`)
  return message
}

export async function markConversationRead(userId, conversationId, messageId) {
  await requireMembership(userId, conversationId)
  const messages = await sequelize.query(`
    SELECT id, created_at FROM chat_messages
    WHERE id = :messageId AND conversation_id = :conversationId LIMIT 1
  `, { replacements: { conversationId, messageId }, type: QueryTypes.SELECT })
  if (!messages[0]) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
  await sequelize.query(`
    INSERT INTO chat_read_states (conversation_id, user_id, last_read_message_id, last_read_at)
    VALUES (:conversationId, :userId, :messageId, :readAt)
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = GREATEST(chat_read_states.last_read_at, EXCLUDED.last_read_at)
  `, { replacements: { conversationId, userId, messageId, readAt: messages[0].created_at } })
  publishRealtimeEvent(roomName('conversation', conversationId), 'chat:read', { userId, messageId }, `chat-read:${userId}:${messageId}`)
  return { conversationId, messageId, readAt: messages[0].created_at }
}

export async function addConversationMember(ownerId, conversationId, username) {
  const conversation = await requireMembership(ownerId, conversationId)
  if (conversation.kind !== 'group' || conversation.role !== 'owner') throw new HttpError(403, 'CHAT_OWNER_REQUIRED', 'Group owner required')
  const users = await resolveUsers([username])
  await sequelize.query(`
    INSERT INTO chat_members (conversation_id, user_id, role, joined_at, left_at)
    VALUES (:conversationId, :userId, 'member', CURRENT_TIMESTAMP, NULL)
    ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL, joined_at = CURRENT_TIMESTAMP
  `, { replacements: { conversationId, userId: users[0].id } })
  return getConversation(ownerId, conversationId)
}

export async function removeConversationMember(ownerId, conversationId, userId) {
  const conversation = await requireMembership(ownerId, conversationId)
  if (conversation.kind !== 'group' || conversation.role !== 'owner') throw new HttpError(403, 'CHAT_OWNER_REQUIRED', 'Group owner required')
  if (userId === ownerId) throw new HttpError(400, 'CHAT_OWNER_CANNOT_LEAVE', 'Owner cannot remove themselves')
  const rows = await sequelize.query(`
    UPDATE chat_members SET left_at = CURRENT_TIMESTAMP
    WHERE conversation_id = :conversationId AND user_id = :userId AND left_at IS NULL RETURNING user_id
  `, { replacements: { conversationId, userId }, type: QueryTypes.SELECT })
  if (!rows[0]) throw new HttpError(404, 'CHAT_MEMBER_NOT_FOUND', 'Chat member not found')
  return getConversation(ownerId, conversationId)
}

export async function updateChatPreferences(userId, conversationId, input) {
  await requireMembership(userId, conversationId)
  await sequelize.query(`
    UPDATE chat_members SET muted_until = :mutedUntil, notifications_enabled = :notificationsEnabled
    WHERE conversation_id = :conversationId AND user_id = :userId AND left_at IS NULL
  `, {
    replacements: {
      conversationId,
      userId,
      mutedUntil: input.muted ? new Date('9999-12-31T23:59:59.000Z') : null,
      notificationsEnabled: input.notificationsEnabled
    }
  })
  return getConversation(userId, conversationId)
}

export async function blockUser(userId, blockedId, blocked) {
  if (userId === blockedId) throw new HttpError(400, 'SELF_BLOCK_NOT_ALLOWED', 'Cannot block yourself')
  if (blocked) {
    await sequelize.query(`
      INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (:userId, :blockedId)
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING
    `, { replacements: { userId, blockedId } })
    await sequelize.query(`
      DELETE FROM follows
      WHERE (follower_id = :userId AND following_id = :blockedId)
         OR (follower_id = :blockedId AND following_id = :userId)
    `, { replacements: { userId, blockedId } })
  } else {
    await sequelize.query(`DELETE FROM user_blocks WHERE blocker_id = :userId AND blocked_id = :blockedId`, {
      replacements: { userId, blockedId }
    })
  }
  return { userId: blockedId, blocked }
}

export async function reportMessage(userId, messageId, reason) {
  return reportTarget(userId, { targetType: 'message', targetId: messageId, reason })
}
