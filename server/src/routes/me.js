import { Router } from 'express'
import { sessionTokenFromRequest } from '../auth/cookies.js'
import { findSessionByToken } from '../auth/sessions.js'
import { profileSchema } from '../auth/schemas.js'
import { updateUserProfile } from '../auth/service.js'
import { ok } from '../http/api.js'
import { HttpError } from '../http/errors.js'
import { parse } from '../http/validation.js'

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
