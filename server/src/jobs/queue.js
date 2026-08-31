import { logger as defaultLogger } from '../config/logger.js'

export function createJobQueue({ name, concurrency = 1, retries = 2, log = defaultLogger } = {}) {
  const pending = []
  const workers = new Set()
  let closed = false

  async function run(job) {
    let attempt = 0
    while (attempt <= retries) {
      try {
        await job.handler(job.payload)
        return
      } catch (error) {
        attempt += 1
        if (attempt > retries) {
          log.error({ err: error, queue: name, job: job.name, attempts: attempt }, 'Job failed permanently')
          throw error
        }
        log.warn({ err: error, queue: name, job: job.name, attempt }, 'Job failed, retrying')
      }
    }
  }

  function pump() {
    while (workers.size < concurrency && pending.length) {
      const job = pending.shift()
      const worker = run(job)
        .catch(error => log.error({ err: error, queue: name, job: job.name }, 'Job worker failed'))
        .finally(() => {
          workers.delete(worker)
          pump()
        })
      workers.add(worker)
    }
  }

  function enqueue(jobName, payload, handler) {
    if (closed) return Promise.reject(new Error(`Job queue closed: ${name}`))
    return new Promise((resolve, reject) => {
      pending.push({ name: jobName, payload, handler: async value => {
        try {
          await handler(value)
          resolve()
        } catch (error) {
          reject(error)
          throw error
        }
      } })
      pump()
    })
  }

  async function drain() {
    while (pending.length || workers.size) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  async function close() {
    closed = true
    await drain()
  }

  return Object.freeze({ enqueue, drain, close })
}

export const notificationJobQueue = createJobQueue({ name: 'notifications', concurrency: 2 })
export const heavyWorkJobQueue = createJobQueue({ name: 'heavy-work', concurrency: 1 })
