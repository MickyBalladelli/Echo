import { Router } from 'express'
import { sessionTokenFromRequest } from '../auth/cookies.js'
import { findSessionByToken } from '../auth/sessions.js'
import { localeSchema, profileSchema, twoFactorCodeSchema } from '../auth/schemas.js'
import { updateUserLocale, updateUserProfile } from '../auth/service.js'
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor, getTwoFactor } from '../auth/two-factor.js'
import { listUserSessions, revokeOtherSessions, revokeSessionById } from '../auth/sessions.js'
import { ok } from '../http/api.js'
import { HttpError } from '../http/errors.js'
import { idSchema, parse } from '../http/validation.js'
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
import { exportUserData, deleteUserAccount } from '../users/account.js'
import { analyticsEventNames, getAnalyticsSummary, recordAnalyticsEvent } from '../analytics/service.js'
import { listLinkedOAuthAccounts } from '../oauth/service.js'
import { z } from 'zod'

const analyticsEventSchema = z.object({
  eventName: z.string().trim().max(64),
  properties: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()])).optional()
})
const analyticsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) })

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

meRouter.get('/sessions', async (request, response, next) => {
  try {
    response.json(ok({ sessions: await listUserSessions(request.auth.userId, request.auth.id) }))
  } catch (error) {
    next(error)
  }
})

meRouter.get('/oauth', async (request, response, next) => {
  try {
    response.json(ok({ accounts: await listLinkedOAuthAccounts(request.auth.userId) }))
  } catch (error) {
    next(error)
  }
})

meRouter.delete('/sessions/:id', async (request, response, next) => {
  try {
    const sessionId = parse(idSchema, request.params.id, 'session id')
    response.json(ok(await revokeSessionById(request.auth.userId, sessionId)))
  } catch (error) {
    next(error)
  }
})

meRouter.delete('/sessions', async (request, response, next) => {
  try {
    response.json(ok(await revokeOtherSessions(request.auth.userId, request.auth.id)))
  } catch (error) {
    next(error)
  }
})

meRouter.put('/locale', async (request, response, next) => {
  try {
    const input = parse(localeSchema, request.body, 'locale request')
    response.json(ok(await updateUserLocale(request.auth.userId, input.locale)))
  } catch (error) {
    next(error)
  }
})

meRouter.get('/2fa', async (request, response, next) => {
  try {
    const factor = await getTwoFactor(request.auth.userId)
    response.json(ok({ enabled: Boolean(factor?.enabled) }))
  } catch (error) {
    next(error)
  }
})

meRouter.post('/2fa/setup', async (request, response, next) => {
  try {
    response.json(ok(await beginTwoFactorSetup(request.auth.userId, request.auth.user.username)))
  } catch (error) {
    next(error)
  }
})

meRouter.post('/2fa/enable', async (request, response, next) => {
  try {
    const input = parse(twoFactorCodeSchema, request.body, 'two-factor setup request')
    response.json(ok(await enableTwoFactor(request.auth.userId, input.code)))
  } catch (error) {
    next(error)
  }
})

meRouter.post('/2fa/disable', async (request, response, next) => {
  try {
    const input = parse(twoFactorCodeSchema, request.body, 'two-factor disable request')
    response.json(ok(await disableTwoFactor(request.auth.userId, input.code)))
  } catch (error) {
    next(error)
  }
})

meRouter.get('/export', async (request, response, next) => {
  try {
    const result = await exportUserData(request.auth.userId)
    response.setHeader('Content-Disposition', 'attachment; filename="echo-data-export.json"')
    response.json(ok(result))
  } catch (error) {
    next(error)
  }
})

meRouter.delete('/account', async (request, response, next) => {
  try {
    await deleteUserAccount(request.auth.userId)
    response.json(ok({ deleted: true }))
  } catch (error) {
    next(error)
  }
})

meRouter.post('/analytics/events', async (request, response, next) => {
  try {
    const input = parse(analyticsEventSchema, request.body, 'analytics event')
    if (!analyticsEventNames.has(input.eventName)) response.json(ok({ recorded: false }))
    else response.json(ok(await recordAnalyticsEvent(request.auth.userId, input.eventName, input.properties)))
  } catch (error) {
    next(error)
  }
})

meRouter.get('/analytics', async (request, response, next) => {
  try {
    const input = parse(analyticsQuerySchema, request.query, 'analytics query')
    response.json(ok({ events: await getAnalyticsSummary(request.auth.userId, input.days) }))
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
