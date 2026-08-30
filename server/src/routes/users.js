import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { idSchema, paginationSchema, parse } from '../http/validation.js'
import { usernameSchema } from '../users/schemas.js'
import { followUser, getPublicProfile, listConnections, listUserPosts, unfollowUser } from '../users/service.js'

export const usersRouter = Router()

usersRouter.put('/:id/follow', async (request, response, next) => {
  try {
    const userId = parse(idSchema, request.params.id, 'user id')
    response.json(ok({ follow: await followUser(request.auth.userId, userId) }))
  } catch (error) {
    next(error)
  }
})

usersRouter.delete('/:id/follow', async (request, response, next) => {
  try {
    const userId = parse(idSchema, request.params.id, 'user id')
    response.json(ok({ follow: await unfollowUser(request.auth.userId, userId) }))
  } catch (error) {
    next(error)
  }
})

usersRouter.get('/:username/posts', async (request, response, next) => {
  try {
    const username = parse(usernameSchema, request.params.username, 'username')
    const page = parse(paginationSchema, request.query, 'user posts query')
    const result = await listUserPosts(request.auth.userId, username, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.posts, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

for (const kind of ['followers', 'following']) {
  usersRouter.get(`/:username/${kind}`, async (request, response, next) => {
    try {
      const username = parse(usernameSchema, request.params.username, 'username')
      const page = parse(paginationSchema, request.query, `${kind} query`)
      const result = await listConnections(username, kind, {
        cursor: decodeCursor(page.cursor),
        limit: page.limit
      })
      response.json(ok(result.users, cursorMeta(result.nextCursor)))
    } catch (error) {
      next(error)
    }
  })
}

usersRouter.get('/:username', async (request, response, next) => {
  try {
    const username = parse(usernameSchema, request.params.username, 'username')
    response.json(ok({ user: await getPublicProfile(request.auth.userId, username) }))
  } catch (error) {
    next(error)
  }
})
