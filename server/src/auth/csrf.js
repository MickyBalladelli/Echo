import { randomBytes } from 'node:crypto'
import { fail } from '../http/api.js'
import { cookieFromRequest } from './cookies.js'

export const csrfCookieName = 'echo_csrf'
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function serializeCsrfCookie(value) {
  const attributes = [
    `${csrfCookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    'Max-Age=86400'
  ]
  if (process.env.NODE_ENV === 'production') attributes.push('Secure')
  return attributes.join('; ')
}

export function ensureCsrfToken(request, response) {
  const existing = cookieFromRequest(request, csrfCookieName)
  if (existing) return existing
  const token = randomBytes(24).toString('base64url')
  response.append('Set-Cookie', serializeCsrfCookie(token))
  return token
}

export function ensureCsrfCookie(request, response, next) {
  ensureCsrfToken(request, response)
  next()
}

export function csrfProtection(request, response, next) {
  if (!unsafeMethods.has(request.method)) return next()

  const csrfCookie = cookieFromRequest(request, csrfCookieName)
  const csrfHeader = request.get('x-csrf-token')
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return response.status(403).json(fail('CSRF_REQUIRED', 'A valid CSRF token is required'))
  }

  next()
}
