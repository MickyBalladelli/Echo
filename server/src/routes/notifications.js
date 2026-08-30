import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { idSchema, paginationSchema, parse } from '../http/validation.js'
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../notifications/service.js'

export const notificationsRouter = Router()

notificationsRouter.get('/', async (request, response, next) => {
  try {
    const page = parse(paginationSchema, request.query, 'notifications query')
    const result = await listNotifications(request.auth.userId, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.notifications, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

notificationsRouter.get('/unread-count', async (request, response, next) => {
  try {
    response.json(ok({ unreadCount: await getUnreadCount(request.auth.userId) }))
  } catch (error) {
    next(error)
  }
})

notificationsRouter.put('/read-all', async (request, response, next) => {
  try {
    response.json(ok(await markAllNotificationsRead(request.auth.userId)))
  } catch (error) {
    next(error)
  }
})

notificationsRouter.put('/:id/read', async (request, response, next) => {
  try {
    const notificationId = parse(idSchema, request.params.id, 'notification id')
    response.json(ok({ notification: await markNotificationRead(request.auth.userId, notificationId) }))
  } catch (error) {
    next(error)
  }
})
