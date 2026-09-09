import { Router } from 'express'
import { ok } from '../http/api.js'
import { idSchema, parse } from '../http/validation.js'
import { adminBadgeSchema, adminBadgeUpdateSchema, adminRoleSchema, adminStatusSchema } from '../admin/schemas.js'
import { listAdminUsers, requireAdmin, updateAdminUserBadge, updateAdminUserRole, updateAdminUserStatus } from '../admin/service.js'

export const adminRouter = Router()

adminRouter.use(async (request, response, next) => {
  try {
    await requireAdmin(request.auth.userId)
    next()
  } catch (error) {
    next(error)
  }
})

adminRouter.get('/users', async (request, response, next) => {
  try {
    response.json(ok({ users: await listAdminUsers(request.auth.userId) }))
  } catch (error) {
    next(error)
  }
})

adminRouter.patch('/users/:id/role', async (request, response, next) => {
  try {
    const userId = parse(idSchema, request.params.id, 'user id')
    const input = parse(adminRoleSchema, request.body, 'admin role request')
    response.json(ok({ user: await updateAdminUserRole(request.auth.userId, userId, input.role) }))
  } catch (error) {
    next(error)
  }
})

adminRouter.patch('/users/:id/status', async (request, response, next) => {
  try {
    const userId = parse(idSchema, request.params.id, 'user id')
    const input = parse(adminStatusSchema, request.body, 'admin status request')
    response.json(ok({ user: await updateAdminUserStatus(request.auth.userId, userId, input.status) }))
  } catch (error) {
    next(error)
  }
})

adminRouter.patch('/users/:id/badges/:badge', async (request, response, next) => {
  try {
    const userId = parse(idSchema, request.params.id, 'user id')
    const badge = parse(adminBadgeSchema, { badge: request.params.badge }, 'admin badge request')
    const input = parse(adminBadgeUpdateSchema, request.body, 'admin badge update')
    response.json(ok({ user: await updateAdminUserBadge(request.auth.userId, userId, badge.badge, input.active) }))
  } catch (error) {
    next(error)
  }
})
