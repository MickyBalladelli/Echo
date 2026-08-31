import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { parse } from '../http/validation.js'
import { explorePostsSchema, searchSchema } from '../search/schemas.js'
import { explorePosts, listTrendingTopics, search } from '../search/service.js'

export const searchRouter = Router()

searchRouter.get('/trending', async (request, response, next) => {
  try {
    response.json(ok({ topics: await listTrendingTopics(request.auth.userId, { limit: 10 }) }))
  } catch (error) {
    next(error)
  }
})

searchRouter.get('/', async (request, response, next) => {
  try {
    const page = parse(searchSchema, request.query, 'search query')
    const result = await search(request.auth.userId, page.q, page.type, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.items, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

searchRouter.get('/explore/posts', async (request, response, next) => {
  try {
    const page = parse(explorePostsSchema, request.query, 'explore posts query')
    const result = await explorePosts(request.auth.userId, page.sort, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.posts, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})
