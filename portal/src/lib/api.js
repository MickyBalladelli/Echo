import { clientEnv } from '../config/env.js'

const apiUrl = clientEnv.apiUrl.replace(/\/$/, '')
let csrfRequest

function csrfTokenFromCookie() {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find(value => value.startsWith('echo_csrf='))
  if (!match) return null
  try {
    return decodeURIComponent(match.slice('echo_csrf='.length))
  } catch {
    return null
  }
}

async function getCsrfToken() {
  const existing = csrfTokenFromCookie()
  if (existing) return existing
  csrfRequest ||= fetch(`${apiUrl}/api/auth/csrf`, { credentials: 'include' })
    .then(response => response.json())
    .then(result => result.data?.csrfToken || null)
    .finally(() => {
      csrfRequest = null
    })
  return csrfRequest
}

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
  const method = (options.method || 'GET').toUpperCase()
  const csrfToken = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await getCsrfToken() : null
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
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
