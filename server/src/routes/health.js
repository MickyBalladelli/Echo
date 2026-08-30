import { Router } from 'express'
import { ok } from '../http/api.js'

export const healthRouter = Router()

healthRouter.get('/', (request, response) => {
  response.json(ok({ service: 'echo-api', status: 'ok', time: new Date().toISOString() }))
})
