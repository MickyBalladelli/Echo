import { Router } from 'express'
import { ok } from '../http/api.js'
import { checkDatabaseHealth } from '../db/pool.js'
import { HttpError } from '../http/errors.js'

export const healthRouter = Router()

healthRouter.get('/live', (request, response) => {
  response.json(ok({ service: 'echo-api', status: 'alive', time: new Date().toISOString() }))
})

healthRouter.get('/', async (request, response, next) => {
  try {
    await checkDatabaseHealth()
    response.json(ok({ service: 'echo-api', status: 'ok', database: 'ok', time: new Date().toISOString() }))
  } catch (error) {
    next(new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is not ready', { cause: error.code || 'connection_failed' }))
  }
})
