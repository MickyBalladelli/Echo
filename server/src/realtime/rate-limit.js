const buckets = new Map()

const limits = Object.freeze({
  'room:join': { windowMs: 60 * 1000, max: 60 },
  'room:leave': { windowMs: 60 * 1000, max: 120 },
  'chat:message:send': { windowMs: 60 * 1000, max: 60 },
  'chat:typing': { windowMs: 10 * 1000, max: 30 },
  'chat:read': { windowMs: 60 * 1000, max: 120 },
  'chat:presence:list': { windowMs: 60 * 1000, max: 30 }
})

export function allowSocketEvent(socket, eventName) {
  const rule = limits[eventName]
  if (!rule) return { allowed: true, retryAfterSeconds: 0 }

  const now = Date.now()
  const key = `${socket.data.auth.userId}:${eventName}`
  const current = buckets.get(key)
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + rule.windowMs }
    : current
  bucket.count += 1
  buckets.set(key, bucket)

  if (buckets.size > 10000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey)
    }
  }

  return {
    allowed: bucket.count <= rule.max,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  }
}
