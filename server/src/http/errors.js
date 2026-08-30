import { fail } from './api.js'

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

  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500
  const code = error.code || 'INTERNAL_ERROR'
  const message = status === 500 ? 'Something went wrong' : error.message

  request.log.error({ err: error, status }, 'Request failed')

  response.status(status).json(fail(code, message, status === 500 ? undefined : error.details))
}
