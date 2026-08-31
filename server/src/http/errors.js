import { fail } from './api.js'
import { captureError } from '../observability/errors.js'

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function notFoundHandler(request, response) {
  response.status(404).json(fail('NOT_FOUND', `Route not found: ${request.method} ${request.originalUrl}`))
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error)
  }

  const parserStatus = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 0
  const status = parserStatus || (error.status && error.status >= 400 && error.status < 600 ? error.status : 500)
  const code = error.code || (error.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : error.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'INTERNAL_ERROR')
  const message = status === 500 ? 'Something went wrong' : error.type === 'entity.too.large' ? 'Request payload is too large' : error.type === 'entity.parse.failed' ? 'Request body is not valid JSON' : error.message

  if (status >= 500) {
    captureError(error, {
      requestId: request.id,
      method: request.method,
      path: request.originalUrl,
      userId: request.auth?.userId
    })
  }
  request.log.error({ err: error, status }, 'Request failed')

  response.status(status).json(fail(code, message, status === 500 ? undefined : error.details))
}
