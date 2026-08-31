import { getConversation, markConversationRead, sendMessage } from './service.js'
import { sendChannelChatMessage } from '../channels/chat.js'
import { realtimeEnvelope } from '../realtime/events.js'
import { logger } from '../config/logger.js'
import { allowSocketEvent } from '../realtime/rate-limit.js'
import {
  chatMessageEventSchema,
  channelChatMessageEventSchema,
  parseSocketEvent,
  presenceListEventSchema,
  readEventSchema,
  typingEventSchema
} from '../realtime/schemas.js'

const onlineUsers = new Map()

function conversationRooms(socket) {
  return [...socket.rooms].filter(room => room.startsWith('conversation:'))
}

function updatePresence(userId, change) {
  const count = Math.max(0, (onlineUsers.get(userId) || 0) + change)
  if (count) onlineUsers.set(userId, count)
  else onlineUsers.delete(userId)
  return count > 0
}

export function initializeChatSocket(socket) {
  const userId = socket.data.auth.userId
  updatePresence(userId, 1)
  socket.to(conversationRooms(socket)).emit(
    'chat:presence',
    realtimeEnvelope('chat:presence', { userId, online: true }, `presence:${userId}:online:${Date.now()}`)
  )

  socket.on('chat:message:send', async (request = {}, acknowledge = () => {}) => {
    const limit = allowSocketEvent(socket, 'chat:message:send')
    const input = parseSocketEvent(chatMessageEventSchema, request)
    if (!limit.allowed) {
      acknowledge({ ok: false, error: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds })
      return
    }
    if (!input) {
      acknowledge({ ok: false, error: 'INVALID_MESSAGE' })
      return
    }
    try {
      const message = await sendMessage(userId, input.conversationId, input.body)
      logger.info({ socketId: socket.id, userId, conversationId: input.conversationId, messageId: message.id }, 'Socket message sent')
      acknowledge({ ok: true, message })
    } catch (error) {
      acknowledge({ ok: false, error: error.code || 'MESSAGE_SEND_FAILED', message: error.message })
    }
  })

  socket.on('channel:chat:message:send', async (request = {}, acknowledge = () => {}) => {
    const limit = allowSocketEvent(socket, 'channel:chat:message:send')
    const input = parseSocketEvent(channelChatMessageEventSchema, request)
    if (!limit.allowed) {
      acknowledge({ ok: false, error: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds })
      return
    }
    if (!input) {
      acknowledge({ ok: false, error: 'INVALID_MESSAGE' })
      return
    }
    try {
      const message = await sendChannelChatMessage(userId, input.channelId, input.body)
      acknowledge({ ok: true, message })
    } catch (error) {
      acknowledge({ ok: false, error: error.code || 'MESSAGE_SEND_FAILED', message: error.message })
    }
  })

  socket.on('chat:typing', async (request = {}, acknowledge = () => {}) => {
    const limit = allowSocketEvent(socket, 'chat:typing')
    const input = parseSocketEvent(typingEventSchema, request)
    if (!limit.allowed) {
      acknowledge({ ok: false, error: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds })
      return
    }
    if (!input) {
      acknowledge({ ok: false, error: 'INVALID_TYPING' })
      return
    }
    try {
      await getConversation(userId, input.conversationId)
      socket.to(`conversation:${input.conversationId}`).emit('chat:typing', realtimeEnvelope(
        'chat:typing',
        { conversationId: input.conversationId, userId, typing: input.typing },
        `typing:${input.conversationId}:${userId}:${input.typing}:${Date.now()}`
      ))
      acknowledge({ ok: true })
    } catch (error) {
      acknowledge({ ok: false, error: error.code || 'TYPING_FAILED' })
    }
  })

  socket.on('chat:read', async (request = {}, acknowledge = () => {}) => {
    const limit = allowSocketEvent(socket, 'chat:read')
    const input = parseSocketEvent(readEventSchema, request)
    if (!limit.allowed) {
      acknowledge({ ok: false, error: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds })
      return
    }
    if (!input) {
      acknowledge({ ok: false, error: 'INVALID_READ' })
      return
    }
    try {
      const receipt = await markConversationRead(userId, input.conversationId, input.messageId)
      acknowledge({ ok: true, receipt })
    } catch (error) {
      acknowledge({ ok: false, error: error.code || 'READ_FAILED' })
    }
  })

  socket.on('chat:presence:list', (request = {}, acknowledge = () => {}) => {
    const limit = allowSocketEvent(socket, 'chat:presence:list')
    const input = parseSocketEvent(presenceListEventSchema, request)
    if (!limit.allowed) {
      acknowledge({ ok: false, error: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds })
      return
    }
    if (!input) {
      acknowledge({ ok: false, error: 'INVALID_PRESENCE_REQUEST' })
      return
    }
    acknowledge({ ok: true, onlineUserIds: input.userIds.filter(id => onlineUsers.has(id)) })
  })

  socket.on('disconnecting', () => {
    const online = updatePresence(userId, -1)
    if (!online) {
      socket.to(conversationRooms(socket)).emit(
        'chat:presence',
        realtimeEnvelope('chat:presence', { userId, online: false }, `presence:${userId}:offline:${Date.now()}`)
      )
    }
  })
}
