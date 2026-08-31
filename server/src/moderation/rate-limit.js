import { fail } from '../http/api.js'

const buckets = new Map()
const limits = Object.freeze({
  post: { windowMs: 60 * 1000, max: 20 },
  reply: { windowMs: 60 * 1000, max: 30 },
  like: { windowMs: 60 * 1000, max: 120 },
  follow: { windowMs: 60 * 1000, max: 30 },
  message: { windowMs: 60 * 1000, max: 60 },
  report: { windowMs: 60 * 60 * 1000, max: 20 }
})

export function abuseRateLimit(action) {
  const rule = limits[action]
  if (!rule) throw new Error(`Unknown abuse rate limit: ${action}`)

  return (request, response, next) => {
    const now = Date.now()
    const identity = request.auth?.userId || request.ip
    const key = `${action}:${identity}`
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + rule.windowMs }
      : current

    bucket.count += 1
    buckets.set(key, bucket)

    if (bucket.count > rule.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      response.setHeader('Retry-After', retryAfter)
      return response.status(429).json(fail('ABUSE_RATE_LIMITED', 'Too many actions. Try again later.', { retryAfterSeconds: retryAfter }))
    }

    if (buckets.size > 10000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey)
      }
    }

    next()
  }
}
