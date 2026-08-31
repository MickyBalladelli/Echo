import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { idSchema, paginationSchema, parse } from '../http/validation.js'
import { addMemberSchema, createConversationSchema, messageSchema, muteSchema, reportSchema } from '../chat/schemas.js'
import {
  addConversationMember,
  blockUser,
  createConversation,
  deleteMessage,
  editMessage,
  getConversation,
  listConversations,
  listMessages,
  markConversationRead,
  removeConversationMember,
  reportMessage,
  sendMessage,
  updateChatPreferences
} from '../chat/service.js'
import { abuseRateLimit } from '../moderation/rate-limit.js'

export const chatRouter = Router()

chatRouter.get('/conversations', async (request, response, next) => {
  try {
    response.json(ok(await listConversations(request.auth.userId)))
  } catch (error) {
    next(error)
  }
})

chatRouter.post('/conversations', async (request, response, next) => {
  try {
    const input = parse(createConversationSchema, request.body, 'conversation request')
    response.status(201).json(ok({ conversation: await createConversation(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.get('/conversations/:id', async (request, response, next) => {
  try {
    const conversationId = parse(idSchema, request.params.id, 'conversation id')
    response.json(ok({ conversation: await getConversation(request.auth.userId, conversationId) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.get('/conversations/:id/messages', async (request, response, next) => {
  try {
    const conversationId = parse(idSchema, request.params.id, 'conversation id')
    const page = parse(paginationSchema, request.query, 'message history query')
    const result = await listMessages(request.auth.userId, conversationId, {
      cursor: decodeCursor(page.cursor), limit: page.limit
    })
    response.json(ok(result.messages, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

chatRouter.post('/conversations/:id/messages', abuseRateLimit('message'), async (request, response, next) => {
  try {
    const conversationId = parse(idSchema, request.params.id, 'conversation id')
    const input = parse(messageSchema, request.body, 'message request')
    response.status(201).json(ok({ message: await sendMessage(request.auth.userId, conversationId, input.body) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.put('/conversations/:id/read/:messageId', async (request, response, next) => {
  try {
    const conversationId = parse(idSchema, request.params.id, 'conversation id')
    const messageId = parse(idSchema, request.params.messageId, 'message id')
    response.json(ok(await markConversationRead(request.auth.userId, conversationId, messageId)))
  } catch (error) {
    next(error)
  }
})

chatRouter.post('/conversations/:id/members', async (request, response, next) => {
  try {
    const conversationId = parse(idSchema, request.params.id, 'conversation id')
    const input = parse(addMemberSchema, request.body, 'chat member request')
    response.json(ok({ conversation: await addConversationMember(request.auth.userId, conversationId, input.username) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.delete('/conversations/:id/members/:userId', async (request, response, next) => {
  try {
    const conversationId = parse(idSchema, request.params.id, 'conversation id')
    const userId = parse(idSchema, request.params.userId, 'user id')
    response.json(ok({ conversation: await removeConversationMember(request.auth.userId, conversationId, userId) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.put('/conversations/:id/preferences', async (request, response, next) => {
  try {
    const conversationId = parse(idSchema, request.params.id, 'conversation id')
    const input = parse(muteSchema, request.body, 'chat preferences request')
    response.json(ok({ conversation: await updateChatPreferences(request.auth.userId, conversationId, input) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.patch('/messages/:id', async (request, response, next) => {
  try {
    const messageId = parse(idSchema, request.params.id, 'message id')
    const input = parse(messageSchema, request.body, 'message update request')
    response.json(ok({ message: await editMessage(request.auth.userId, messageId, input.body) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.delete('/messages/:id', async (request, response, next) => {
  try {
    const messageId = parse(idSchema, request.params.id, 'message id')
    response.json(ok({ message: await deleteMessage(request.auth.userId, messageId) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.post('/messages/:id/reports', abuseRateLimit('report'), async (request, response, next) => {
  try {
    const messageId = parse(idSchema, request.params.id, 'message id')
    const input = parse(reportSchema, request.body, 'message report request')
    response.status(201).json(ok({ report: await reportMessage(request.auth.userId, messageId, input.reason) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.put('/blocks/:userId', async (request, response, next) => {
  try {
    const userId = parse(idSchema, request.params.userId, 'user id')
    response.json(ok({ block: await blockUser(request.auth.userId, userId, true) }))
  } catch (error) {
    next(error)
  }
})

chatRouter.delete('/blocks/:userId', async (request, response, next) => {
  try {
    const userId = parse(idSchema, request.params.userId, 'user id')
    response.json(ok({ block: await blockUser(request.auth.userId, userId, false) }))
  } catch (error) {
    next(error)
  }
})
