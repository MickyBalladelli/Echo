import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { idSchema, paginationSchema, parse } from '../http/validation.js'
import { createPostSchema } from '../posts/schemas.js'
import { createPost, deletePost, getPostById, listPosts } from '../posts/service.js'

export const postsRouter = Router()

postsRouter.get('/', async (request, response, next) => {
  try {
    const page = parse(paginationSchema, request.query, 'post feed query')
    const result = await listPosts(request.auth.userId, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.posts, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

postsRouter.post('/', async (request, response, next) => {
  try {
    const input = parse(createPostSchema, request.body, 'post request')
    const post = await createPost(request.auth.userId, input)
    response.status(201).json(ok({ post }))
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/:id', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const post = await getPostById(request.auth.userId, postId)
    response.json(ok({ post }))
  } catch (error) {
    next(error)
  }
})

postsRouter.delete('/:id', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const deleted = await deletePost(request.auth.userId, postId)
    response.json(ok({ post: deleted }))
  } catch (error) {
    next(error)
  }
})
