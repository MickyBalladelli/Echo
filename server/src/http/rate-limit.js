import { fail } from './api.js'

const buckets = new Map()

export function rateLimit({ windowMs, max }) {
  return (request, response, next) => {
    const now = Date.now()
    const key = `${request.ip}:${request.path}`
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current

    bucket.count += 1
    buckets.set(key, bucket)

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      response.setHeader('Retry-After', retryAfter)
      return response.status(429).json(fail('RATE_LIMITED', 'Too many attempts. Try again later.'))
    }

    if (buckets.size > 10000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey)
      }
    }

    next()
  }
}
