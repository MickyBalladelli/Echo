import { Router } from 'express'
import { ok } from '../http/api.js'
import { idSchema, paginationSchema, parse } from '../http/validation.js'
import { abuseRateLimit } from '../moderation/rate-limit.js'
import { appealSchema, reportSchema, reviewAppealSchema, reviewReportSchema } from '../moderation/schemas.js'
import {
  createAppeal,
  listModerationAppeals,
  listModerationQueue,
  reportTarget,
  reviewModerationAppeal,
  reviewModerationReport
} from '../moderation/service.js'

export const moderationRouter = Router()

moderationRouter.get('/queue', async (request, response, next) => {
  try {
    const page = parse(paginationSchema, request.query, 'moderation queue query')
    response.json(ok({ reports: await listModerationQueue(request.auth.userId, page.limit) }))
  } catch (error) {
    next(error)
  }
})

moderationRouter.get('/appeals', async (request, response, next) => {
  try {
    const page = parse(paginationSchema, request.query, 'moderation appeals query')
    response.json(ok({ appeals: await listModerationAppeals(request.auth.userId, page.limit) }))
  } catch (error) {
    next(error)
  }
})

moderationRouter.post('/reports', abuseRateLimit('report'), async (request, response, next) => {
  try {
    const input = parse(reportSchema, request.body, 'moderation report request')
    response.status(201).json(ok({ report: await reportTarget(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

moderationRouter.patch('/reports/:id', async (request, response, next) => {
  try {
    const reportId = parse(idSchema, request.params.id, 'report id')
    const input = parse(reviewReportSchema, request.body, 'report review request')
    response.json(ok({ report: await reviewModerationReport(request.auth.userId, reportId, input) }))
  } catch (error) {
    next(error)
  }
})

moderationRouter.post('/appeals', async (request, response, next) => {
  try {
    const input = parse(appealSchema, request.body, 'moderation appeal request')
    response.status(201).json(ok({ appeal: await createAppeal(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

moderationRouter.patch('/appeals/:id', async (request, response, next) => {
  try {
    const appealId = parse(idSchema, request.params.id, 'appeal id')
    const input = parse(reviewAppealSchema, request.body, 'appeal review request')
    response.json(ok({ appeal: await reviewModerationAppeal(request.auth.userId, appealId, input) }))
  } catch (error) {
    next(error)
  }
})
