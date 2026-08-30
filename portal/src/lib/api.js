import { clientEnv } from '../config/env.js'

const apiUrl = clientEnv.apiUrl.replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function apiRequest(path, options = {}) {
  const hasBody = options.body !== undefined
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })
  const result = await response.json().catch(() => null)

  if (!response.ok || !result?.ok) {
    throw new ApiError(
      result?.error?.message || `Request failed with status ${response.status}`,
      {
        status: response.status,
        code: result?.error?.code,
        details: result?.error?.details
      }
    )
  }

  return result
}
