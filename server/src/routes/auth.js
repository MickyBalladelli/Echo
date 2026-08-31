import { Router } from 'express'
import { ok } from '../http/api.js'
import { rateLimit } from '../http/rate-limit.js'
import { parse } from '../http/validation.js'
import { clearSessionCookie, sessionTokenFromRequest, setSessionCookie } from '../auth/cookies.js'
import { requireAuth } from '../auth/middleware.js'
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  tokenSchema,
  twoFactorCodeSchema
} from '../auth/schemas.js'
import { loginUser, registerUser } from '../auth/service.js'
import { findSessionByToken, revokeSession } from '../auth/sessions.js'
import { ensureCsrfToken } from '../auth/csrf.js'
import { createEmailVerificationToken, createPasswordResetToken, resetPassword, verifyEmailToken } from '../auth/tokens.js'
import { completeTwoFactorLogin } from '../auth/two-factor.js'
import { HttpError } from '../http/errors.js'
import { env } from '../config/env.js'
import { completeOAuthLogin, createOAuthAuthorization, listOAuthProviders } from '../oauth/service.js'

export const authRouter = Router()
const registrationLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })
const recoveryLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })

function requestInfo(request) {
  return {
    userAgent: request.get('user-agent'),
    ipAddress: request.ip
  }
}

authRouter.get('/csrf', (request, response) => {
  response.json(ok({ csrfToken: ensureCsrfToken(request, response) }))
})

authRouter.get('/oauth/providers', (request, response) => {
  response.json(ok({ providers: listOAuthProviders() }))
})

authRouter.get('/oauth/:provider/start', (request, response) => {
  const provider = String(request.params.provider || '').toLowerCase()
  const match = listOAuthProviders().find(item => item.provider === provider)
  if (!match) {
    response.status(404).json(ok({ provider, configured: false }))
    return
  }
  if (match.configured) {
    const redirectUri = process.env.OAUTH_CALLBACK_URL || `${request.protocol}://${request.get('host')}/api/auth/oauth/${provider}/callback`
    createOAuthAuthorization(provider, redirectUri)
      .then(authorizationUrl => response.redirect(authorizationUrl))
      .catch(() => response.status(503).json(ok({ provider, configured: true, authorizationUrl: null })))
    return
  }
  response.json(ok({
    provider,
    configured: match.configured,
    authorizationUrl: null,
    message: match.configured
      ? 'Provider credentials are present. Add the provider authorization URL to enable login.'
      : 'Set provider client credentials to enable OAuth login.'
  }))
})

authRouter.get('/oauth/:provider/callback', async (request, response) => {
  const provider = String(request.params.provider || '').toLowerCase()
  const redirectUri = process.env.OAUTH_CALLBACK_URL || `${request.protocol}://${request.get('host')}/api/auth/oauth/${provider}/callback`
  try {
    const result = await completeOAuthLogin(provider, String(request.query.code || ''), String(request.query.state || ''), redirectUri, requestInfo(request))
    const session = await findSessionByToken(result.session.token)
    setSessionCookie(response, result.session.token, result.session.maxAgeSeconds)
    response.redirect(`${env.clientOrigin}/?oauth=success&username=${encodeURIComponent(session.user.username)}`)
  } catch {
    response.redirect(`${env.clientOrigin}/?oauth=error`)
  }
})

authRouter.post('/register', registrationLimit, async (request, response, next) => {
  try {
    const input = parse(registerSchema, request.body, 'registration request')
    const result = await registerUser(input, requestInfo(request))
    setSessionCookie(response, result.session.token, result.session.maxAgeSeconds)
    response.status(201).json(ok({
      user: result.user,
      emailVerificationToken: process.env.NODE_ENV === 'production' ? undefined : result.emailVerificationToken
    }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/login', loginLimit, async (request, response, next) => {
  try {
    const input = parse(loginSchema, request.body, 'login request')
    const result = await loginUser(input, requestInfo(request))
    if (result.twoFactorRequired) {
      response.json(ok({ user: result.user, twoFactorRequired: true, challengeToken: result.challengeToken }))
      return
    }
    setSessionCookie(response, result.session.token, result.session.maxAgeSeconds)
    response.json(ok({ user: result.user }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/login/2fa', loginLimit, async (request, response, next) => {
  try {
    const input = parse(twoFactorCodeSchema, request.body, 'two-factor login request')
    if (!input.challengeToken) throw new HttpError(400, 'CHALLENGE_REQUIRED', 'Two-factor challenge is required')
    const result = await completeTwoFactorLogin(input.challengeToken, input.code, requestInfo(request))
    const session = await findSessionByToken(result.session.token)
    setSessionCookie(response, result.session.token, result.session.maxAgeSeconds)
    response.json(ok({ user: session.user }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/password-reset/request', recoveryLimit, async (request, response, next) => {
  try {
    const input = parse(passwordResetRequestSchema, request.body, 'password reset request')
    const token = await createPasswordResetToken(input.identifier)
    response.json(ok({
      requested: true,
      resetToken: process.env.NODE_ENV === 'production' ? undefined : token
    }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/password-reset/confirm', recoveryLimit, async (request, response, next) => {
  try {
    const input = parse(passwordResetConfirmSchema, request.body, 'password reset confirmation')
    if (!await resetPassword(input.token, input.password)) {
      response.status(400).json(ok({ reset: false }))
      return
    }
    response.json(ok({ reset: true }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/verify-email', recoveryLimit, async (request, response, next) => {
  try {
    const input = parse(tokenSchema, request.body, 'email verification request')
    response.json(ok({ verified: await verifyEmailToken(input.token) }))
  } catch (error) {
    next(error)
  }
})

authRouter.post('/verify-email/request', requireAuth, recoveryLimit, async (request, response, next) => {
  try {
    const token = await createEmailVerificationToken(request.auth.userId)
    response.json(ok({
      requested: true,
      verificationToken: process.env.NODE_ENV === 'production' ? undefined : token
    }))
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
