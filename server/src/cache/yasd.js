import { YASD, YasdClient } from 'yasd'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

const namespaceTtls = Object.freeze({
  feed: env.cacheTtlMsFeed,
  feeds: env.cacheTtlMsFeed,
  channels: env.cacheTtlMsChannels,
  popular: env.cacheTtlMsPopular,
  'popular-posts': env.cacheTtlMsPopular,
  unread: env.cacheTtlMsUnread,
  'unread-channels': env.cacheTtlMsUnread
})

function namespaceOf(key) {
  const separator = key.indexOf(':')
  return separator > 0 ? key.slice(0, separator) : ''
}

function ttlForKey(key) {
  return namespaceTtls[namespaceOf(key)]
}

function createBackend() {
  if (env.cacheUrl) {
    return {
      remote: true,
      value: new YasdClient({ url: env.cacheUrl })
    }
  }

  return {
    remote: false,
    value: new YASD({
      maxEntries: env.cacheMaxEntries,
      namespaceTTLMs: namespaceTtls
    })
  }
}

export class EchoCache {
  constructor() {
    const backend = createBackend()
    this.remote = backend.remote
    this.backend = backend.value
    this.connecting = null
    this.lastFailureAt = 0
  }

  async connect() {
    if (!this.remote) return true
    if (!this.connecting) {
      this.connecting = this.backend.connect()
        .then(() => true)
        .catch(error => {
          this.connecting = null
          this.reportFailure('connect', error)
          return false
        })
    }
    return this.connecting
  }

  async run(operation, fallback, callback) {
    try {
      const connected = await this.connect()
      if (!connected) return fallback
      const value = await callback(this.backend)
      this.lastFailureAt = 0
      return value
    } catch (error) {
      this.reportFailure(operation, error)
      return fallback
    }
  }

  reportFailure(operation, error) {
    const now = Date.now()
    if (now - this.lastFailureAt < 30000) return
    this.lastFailureAt = now
    logger.warn({ operation, err: error }, 'YASD cache unavailable; using PostgreSQL')
  }

  async get(key) {
    return this.run('get', undefined, backend => backend.get(key))
  }

  async set(key, value, ttlMs) {
    const effectiveTtl = ttlMs === undefined ? ttlForKey(key) : ttlMs
    return this.run('set', value, async backend => {
      await backend.set(key, value, effectiveTtl)
      return value
    })
  }

  async del(key) {
    return this.run('del', false, backend => backend.del(key))
  }

  async clear(namespace) {
    return this.run('clear', 0, backend => backend.clearPrefix(namespace))
  }

  async close() {
    if (this.remote) {
      await this.backend.close()
      return
    }
    this.backend.close()
  }
}

export const cache = new EchoCache()

export function cacheKey(namespace, value) {
  return `${namespace}:${JSON.stringify(value)}`
}

export function cacheGet(key) {
  return cache.get(key)
}

export function cacheSet(key, value, ttlMs) {
  return cache.set(key, value, ttlMs)
}

export function cacheDel(key) {
  return cache.del(key)
}

export function cacheClear(namespace) {
  return cache.clear(namespace)
}

export function cacheConnect() {
  return cache.connect()
}

export function cacheClose() {
  return cache.close()
}
