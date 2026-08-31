import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { idSchema, parse } from '../http/validation.js'
import { createPostSchema, createReplySchema, postFeedSchema, updatePostSchema } from '../posts/schemas.js'
import {
  bookmarkPost,
  createPost,
  createReply,
  deletePost,
  getPostById,
  getPostEditHistory,
  likePost,
  listPosts,
  unbookmarkPost,
  updatePost,
  unlikePost
} from '../posts/service.js'

export const postsRouter = Router()

postsRouter.get('/', async (request, response, next) => {
  try {
    const page = parse(postFeedSchema, request.query, 'post feed query')
    const result = await listPosts(request.auth.userId, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit,
      feed: page.feed,
      hashtag: page.hashtag
    })
    response.json(ok(result.posts, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/:id/edits', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    response.json(ok({ edits: await getPostEditHistory(request.auth.userId, postId) }))
  } catch (error) {
    next(error)
  }
})

postsRouter.post('/:id/repost', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const input = parse(createPostSchema, {
      ...(request.body || {}),
      channelId: null,
      repostOfPostId: postId
    }, 'repost request')
    const post = await createPost(request.auth.userId, input)
    response.status(201).json(ok({ post }))
  } catch (error) {
    next(error)
  }
})

postsRouter.put('/:id/bookmark', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    response.json(ok({ bookmark: await bookmarkPost(request.auth.userId, postId) }))
  } catch (error) {
    next(error)
  }
})

postsRouter.delete('/:id/bookmark', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    response.json(ok({ bookmark: await unbookmarkPost(request.auth.userId, postId) }))
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

postsRouter.post('/:id/replies', async (request, response, next) => {
  try {
    const parentPostId = parse(idSchema, request.params.id, 'parent post id')
    const input = parse(createReplySchema, request.body, 'reply request')
    const reply = await createReply(request.auth.userId, parentPostId, input)
    response.status(201).json(ok({ reply }))
  } catch (error) {
    next(error)
  }
})

postsRouter.put('/:id/likes', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const like = await likePost(request.auth.userId, postId)
    response.json(ok({ like }))
  } catch (error) {
    next(error)
  }
})

postsRouter.delete('/:id/likes', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const like = await unlikePost(request.auth.userId, postId)
    response.json(ok({ like }))
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

postsRouter.patch('/:id', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const input = parse(updatePostSchema, request.body, 'post update request')
    const post = await updatePost(request.auth.userId, postId, input)
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
