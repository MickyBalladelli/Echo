export const sessionCookieName = 'echo_session'

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=')
    if (separator < 0) return cookies

    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name) {
      try {
        cookies[name] = decodeURIComponent(value)
      } catch {
        cookies[name] = value
      }
    }

    return cookies
  }, {})
}

export function cookieFromRequest(request, name) {
  return parseCookies(request.headers.cookie)[name] || null
}

export function sessionTokenFromHeaders(headers = {}) {
  return parseCookies(headers.cookie)[sessionCookieName] || null
}

export function sessionTokenFromRequest(request) {
  return cookieFromRequest(request, sessionCookieName)
}

function serializeSessionCookie(value, maxAge) {
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ]

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

export function setSessionCookie(response, token, maxAgeSeconds) {
  response.append('Set-Cookie', serializeSessionCookie(token, maxAgeSeconds))
}

export function clearSessionCookie(response) {
  response.append('Set-Cookie', serializeSessionCookie('', 0))
}
