import { Router } from 'express'
import { ok } from '../http/api.js'
import { rateLimit } from '../http/rate-limit.js'
import { parse } from '../http/validation.js'
import { clearSessionCookie, sessionTokenFromRequest, setSessionCookie } from '../auth/cookies.js'
import { requireAuth } from '../auth/middleware.js'
import { loginSchema, registerSchema } from '../auth/schemas.js'
import { loginUser, registerUser } from '../auth/service.js'
import { revokeSession } from '../auth/sessions.js'

export const authRouter = Router()
const registrationLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })

function requestInfo(request) {
  return {
    userAgent: request.get('user-agent'),
    ipAddress: request.ip
  }
}

authRouter.post('/register', registrationLimit, async (request, response, next) => {
  try {
    const input = parse(registerSchema, request.body, 'registration request')
    const result = await registerUser(input, requestInfo(request))
    setSessionCookie(response, result.session.token, result.session.maxAgeSeconds)
    response.status(201).json(ok({ user: result.user }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/login', loginLimit, async (request, response, next) => {
  try {
    const input = parse(loginSchema, request.body, 'login request')
    const result = await loginUser(input, requestInfo(request))
    setSessionCookie(response, result.session.token, result.session.maxAgeSeconds)
    response.json(ok({ user: result.user }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/logout', async (request, response, next) => {
  try {
    await revokeSession(sessionTokenFromRequest(request))
    clearSessionCookie(response)
    response.json(ok({ loggedOut: true }))
  } catch (error) {
    next(error)
  }
})

authRouter.get('/me', requireAuth, (request, response) => {
  response.json(ok({ user: request.auth.user }))
})
