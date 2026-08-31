import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { idSchema, parse } from '../http/validation.js'
import { createPostSchema, createReplySchema, pollSchema, postFeedSchema, scheduledPostSchema, updatePostSchema } from '../posts/schemas.js'
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
import { abuseRateLimit } from '../moderation/rate-limit.js'
import { cancelScheduledPost, listScheduledPosts, schedulePost } from '../posts/scheduled.js'
import { createPoll, votePoll } from '../posts/polls.js'

export const postsRouter = Router()

postsRouter.get('/scheduled', async (request, response, next) => {
  try {
    response.json(ok({ scheduledPosts: await listScheduledPosts(request.auth.userId) }))
  } catch (error) {
    next(error)
  }
})

postsRouter.post('/scheduled', abuseRateLimit('post'), async (request, response, next) => {
  try {
    const input = parse(scheduledPostSchema, request.body, 'scheduled post request')
    response.status(201).json(ok({ scheduledPost: await schedulePost(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

postsRouter.delete('/scheduled/:id', async (request, response, next) => {
  try {
    const scheduledId = parse(idSchema, request.params.id, 'scheduled post id')
    response.json(ok({ scheduledPost: await cancelScheduledPost(request.auth.userId, scheduledId) }))
  } catch (error) {
    next(error)
  }
})

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

postsRouter.post('/:id/repost', abuseRateLimit('post'), async (request, response, next) => {
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

postsRouter.post('/', abuseRateLimit('post'), async (request, response, next) => {
  try {
    const input = parse(createPostSchema, request.body, 'post request')
    const post = await createPost(request.auth.userId, input)
    response.status(201).json(ok({ post }))
  } catch (error) {
    next(error)
  }
})

postsRouter.post('/:id/replies', abuseRateLimit('reply'), async (request, response, next) => {
  try {
    const parentPostId = parse(idSchema, request.params.id, 'parent post id')
    const input = parse(createReplySchema, request.body, 'reply request')
    const reply = await createReply(request.auth.userId, parentPostId, input)
    response.status(201).json(ok({ reply }))
  } catch (error) {
    next(error)
  }
})

postsRouter.post('/:id/poll', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const input = parse(pollSchema, request.body, 'poll request')
    response.status(201).json(ok({ poll: await createPoll(request.auth.userId, postId, input) }))
  } catch (error) {
    next(error)
  }
})

postsRouter.put('/:id/poll/vote', async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const optionId = parse(idSchema, request.body?.optionId, 'poll option id')
    response.json(ok({ poll: await votePoll(request.auth.userId, postId, optionId) }))
  } catch (error) {
    next(error)
  }
})

postsRouter.put('/:id/likes', abuseRateLimit('like'), async (request, response, next) => {
  try {
    const postId = parse(idSchema, request.params.id, 'post id')
    const like = await likePost(request.auth.userId, postId)
    response.json(ok({ like }))
  } catch (error) {
    next(error)
  }
})

postsRouter.delete('/:id/likes', abuseRateLimit('like'), async (request, response, next) => {
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
