const entries = new Map()
const maxEntries = 2000

export function cacheKey(namespace, value) {
  return `${namespace}:${JSON.stringify(value)}`
}

export function cacheGet(key) {
  const entry = entries.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key)
    return undefined
  }
  return entry.value
}

export function cacheSet(key, value, ttlMs) {
  if (entries.size >= maxEntries && !entries.has(key)) {
    const oldestKey = entries.keys().next().value
    if (oldestKey) entries.delete(oldestKey)
  }
  entries.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

export function cacheClear(namespace) {
  for (const key of entries.keys()) {
    if (key.startsWith(`${namespace}:`)) entries.delete(key)
  }
}
