import { sessionTokenFromHeaders, sessionTokenFromRequest } from './cookies.js'
import { findSessionByToken } from './sessions.js'
import { HttpError } from '../http/errors.js'

export async function requireAuth(request, response, next) {
  try {
    const token = sessionTokenFromRequest(request)
    const session = await findSessionByToken(token)

    if (!session) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required')
    }

    request.auth = session
    next()
  } catch (error) {
    next(error)
  }
}

export async function authenticateSocket(socket, next) {
  try {
    const session = await findSessionByToken(sessionTokenFromHeaders(socket.handshake.headers))

    if (!session) {
      return next(new Error('AUTH_REQUIRED'))
    }

    socket.data.auth = session
    next()
  } catch {
    next(new Error('AUTH_REQUIRED'))
  }
}
