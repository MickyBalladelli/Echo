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

async function getCsrfToken(forceRefresh = false) {
  const existing = forceRefresh ? null : csrfTokenFromCookie()
  if (existing) return existing
  csrfRequest ||= fetch(`${apiUrl}/api/auth/csrf`, { credentials: 'include', cache: 'no-store' })
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
  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  let csrfToken = unsafe ? await getCsrfToken() : null
  const makeRequest = token => fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-CSRF-Token': token } : {}),
      ...(options.headers || {})
    }
  })

  let response = await makeRequest(csrfToken)
  let result = await response.json().catch(() => null)

  if (unsafe && response.status === 403 && result?.error?.code === 'CSRF_REQUIRED') {
    csrfToken = await getCsrfToken(true)
    response = await makeRequest(csrfToken)
    result = await response.json().catch(() => null)
  }

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
