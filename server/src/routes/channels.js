import { Router } from 'express'
import { postBodySchema } from '../posts/schemas.js'
import { createPost } from '../posts/service.js'
import {
  channelInviteSchema,
  channelModerationSchema,
  channelPinnedPostSchema,
  channelPreferencesSchema,
  channelRoleSchema,
  channelSlugSchema,
  createChannelSchema,
  updateChannelSchema
} from '../channels/schemas.js'
import {
  createChannel,
  getChannel,
  inviteToChannel,
  joinChannel,
  leaveChannel,
  listChannelMembers,
  listChannelPosts,
  listChannels,
  moderateChannelPost,
  setPinnedPost,
  updateChannel,
  updateChannelPreferences,
  updateMemberRole
} from '../channels/service.js'
import { ok, cursorMeta } from '../http/api.js'
import { decodeCursor } from '../http/pagination.js'
import { idSchema, paginationSchema, parse } from '../http/validation.js'
import { abuseRateLimit } from '../moderation/rate-limit.js'

export const channelsRouter = Router()

channelsRouter.get('/', async (request, response, next) => {
  try {
    const page = parse(paginationSchema, request.query, 'channels query')
    const result = await listChannels(request.auth.userId, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.channels, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

channelsRouter.post('/', async (request, response, next) => {
  try {
    const input = parse(createChannelSchema, request.body, 'channel request')
    response.status(201).json(ok({ channel: await createChannel(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.get('/:slug/posts', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const page = parse(paginationSchema, request.query, 'channel posts query')
    const result = await listChannelPosts(request.auth.userId, slug, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.posts, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

channelsRouter.post('/:slug/posts', abuseRateLimit('post'), async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const input = parse(postBodySchema, request.body, 'channel post request')
    const channel = await getChannel(request.auth.userId, slug)
    const post = await createPost(request.auth.userId, { body: input.body, channelId: channel.id, visibility: 'public' })
    response.status(201).json(ok({ post }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.patch('/:slug/posts/:postId/moderation', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const postId = parse(idSchema, request.params.postId, 'channel post id')
    const input = parse(channelModerationSchema, request.body, 'channel moderation request')
    response.json(ok({ post: await moderateChannelPost(request.auth.userId, slug, postId, input.status) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.get('/:slug/members', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    response.json(ok(await listChannelMembers(request.auth.userId, slug)))
  } catch (error) {
    next(error)
  }
})

channelsRouter.put('/:slug/members/:userId/role', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const userId = parse(idSchema, request.params.userId, 'user id')
    const input = parse(channelRoleSchema, request.body, 'channel role request')
    response.json(ok({ member: await updateMemberRole(request.auth.userId, slug, userId, input.role) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.put('/:slug/membership', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    response.json(ok({ channel: await joinChannel(request.auth.userId, slug) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.put('/:slug/preferences', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const input = parse(channelPreferencesSchema, request.body, 'channel preferences request')
    response.json(ok({ channel: await updateChannelPreferences(request.auth.userId, slug, input) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.delete('/:slug/membership', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    response.json(ok(await leaveChannel(request.auth.userId, slug)))
  } catch (error) {
    next(error)
  }
})

channelsRouter.post('/:slug/invites', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const input = parse(channelInviteSchema, request.body, 'channel invite request')
    response.status(201).json(ok({ invite: await inviteToChannel(request.auth.userId, slug, input.username) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.patch('/:slug', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const input = parse(updateChannelSchema, request.body, 'channel update request')
    response.json(ok({ channel: await updateChannel(request.auth.userId, slug, input) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.patch('/:slug/pinned-post', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    const input = parse(channelPinnedPostSchema, request.body, 'channel pinned post request')
    response.json(ok({ channel: await setPinnedPost(request.auth.userId, slug, input.postId) }))
  } catch (error) {
    next(error)
  }
})

channelsRouter.get('/:slug', async (request, response, next) => {
  try {
    const slug = parse(channelSlugSchema, request.params.slug, 'channel slug')
    response.json(ok({ channel: await getChannel(request.auth.userId, slug) }))
  } catch (error) {
    next(error)
  }
})
