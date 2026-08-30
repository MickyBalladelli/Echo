import { getConversation, markConversationRead, sendMessage } from './service.js'
import { realtimeEnvelope } from '../realtime/events.js'

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
    const conversationId = String(request.conversationId || '')
    const body = String(request.body || '').trim()
    if (!body || body.length > 4000) {
      acknowledge({ ok: false, error: 'INVALID_MESSAGE' })
      return
    }
    try {
      const message = await sendMessage(userId, conversationId, body)
      acknowledge({ ok: true, message })
    } catch (error) {
      acknowledge({ ok: false, error: error.code || 'MESSAGE_SEND_FAILED', message: error.message })
    }
  })

  socket.on('chat:typing', async (request = {}, acknowledge = () => {}) => {
    const conversationId = String(request.conversationId || '')
    try {
      await getConversation(userId, conversationId)
      socket.to(`conversation:${conversationId}`).emit('chat:typing', realtimeEnvelope(
        'chat:typing',
        { conversationId, userId, typing: Boolean(request.typing) },
        `typing:${conversationId}:${userId}:${Boolean(request.typing)}:${Date.now()}`
      ))
      acknowledge({ ok: true })
    } catch (error) {
      acknowledge({ ok: false, error: error.code || 'TYPING_FAILED' })
    }
  })

  socket.on('chat:read', async (request = {}, acknowledge = () => {}) => {
    try {
      const receipt = await markConversationRead(userId, String(request.conversationId || ''), String(request.messageId || ''))
      acknowledge({ ok: true, receipt })
    } catch (error) {
      acknowledge({ ok: false, error: error.code || 'READ_FAILED' })
    }
  })

  socket.on('chat:presence:list', (request = {}, acknowledge = () => {}) => {
    const userIds = Array.isArray(request.userIds) ? request.userIds.slice(0, 100) : []
    acknowledge({ ok: true, onlineUserIds: userIds.filter(id => onlineUsers.has(id)) })
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
