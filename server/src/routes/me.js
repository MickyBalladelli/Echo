import { Router } from 'express'
import { sessionTokenFromRequest } from '../auth/cookies.js'
import { findSessionByToken } from '../auth/sessions.js'
import { profileSchema } from '../auth/schemas.js'
import { updateUserProfile } from '../auth/service.js'
import { ok } from '../http/api.js'
import { HttpError } from '../http/errors.js'
import { parse } from '../http/validation.js'
import { decodeCursor } from '../http/pagination.js'
import { draftQuerySchema, draftSchema, pinnedPostSchema, postFeedSchema } from '../posts/schemas.js'
import { deletePostDraft, getPostDraft, savePostDraft } from '../posts/drafts.js'
import { listBookmarkedPosts } from '../posts/service.js'
import { setPinnedPost } from '../users/service.js'
import { emailPreferencesSchema, notificationPreferencesSchema } from '../notifications/schemas.js'
import {
  getEmailNotificationPreferences,
  getNotificationPreferences,
  updateEmailNotificationPreferences,
  updateNotificationPreferences
} from '../notifications/service.js'

export const meRouter = Router()

meRouter.patch('/profile', async (request, response, next) => {
  try {
    const input = parse(profileSchema, request.body, 'profile request')
    await updateUserProfile(request.auth.userId, input)
    const session = await findSessionByToken(sessionTokenFromRequest(request))
    if (!session) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required')
    }
    response.json(ok({ user: session.user }))
  } catch (error) {
    next(error)
  }
})

meRouter.get('/notification-preferences', async (request, response, next) => {
  try {
    const [preferences, email] = await Promise.all([
      getNotificationPreferences(request.auth.userId),
      getEmailNotificationPreferences(request.auth.userId)
    ])
    response.json(ok({ preferences, email }))
  } catch (error) {
    next(error)
  }
})

meRouter.put('/notification-preferences', async (request, response, next) => {
  try {
    const input = parse(notificationPreferencesSchema, request.body, 'notification preferences request')
    response.json(ok({ preferences: await updateNotificationPreferences(request.auth.userId, input.preferences) }))
  } catch (error) {
    next(error)
  }
})

meRouter.put('/email-preferences', async (request, response, next) => {
  try {
    const input = parse(emailPreferencesSchema, request.body, 'email preferences request')
    response.json(ok({ email: await updateEmailNotificationPreferences(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

meRouter.get('/bookmarks', async (request, response, next) => {
  try {
    const page = parse(postFeedSchema, request.query, 'bookmark query')
    const result = await listBookmarkedPosts(request.auth.userId, {
      cursor: decodeCursor(page.cursor),
      limit: page.limit
    })
    response.json(ok(result.posts, { nextCursor: result.nextCursor }))
  } catch (error) {
    next(error)
  }
})

meRouter.get('/post-draft', async (request, response, next) => {
  try {
    const query = parse(draftQuerySchema, request.query, 'draft query')
    response.json(ok({ draft: await getPostDraft(request.auth.userId, query.channelId || null) }))
  } catch (error) {
    next(error)
  }
})

meRouter.put('/post-draft', async (request, response, next) => {
  try {
    const input = parse(draftSchema, request.body, 'draft request')
    response.json(ok({ draft: await savePostDraft(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

meRouter.delete('/post-draft', async (request, response, next) => {
  try {
    const query = parse(draftQuerySchema, request.query, 'draft query')
    response.json(ok({ draft: await deletePostDraft(request.auth.userId, query.channelId || null) }))
  } catch (error) {
    next(error)
  }
})

meRouter.patch('/pinned-post', async (request, response, next) => {
  try {
    const input = parse(pinnedPostSchema, request.body, 'pinned post request')
    response.json(ok({ pin: await setPinnedPost(request.auth.userId, input.postId) }))
  } catch (error) {
    next(error)
  }
})
