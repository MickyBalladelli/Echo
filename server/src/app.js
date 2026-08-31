import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { requireAuth } from './auth/middleware.js'
import { errorHandler, notFoundHandler } from './http/errors.js'
import { authRouter } from './routes/auth.js'
import { healthRouter } from './routes/health.js'
import { meRouter } from './routes/me.js'
import { postsRouter } from './routes/posts.js'
import { usersRouter } from './routes/users.js'
import { searchRouter } from './routes/search.js'
import { notificationsRouter } from './routes/notifications.js'
import { channelsRouter } from './routes/channels.js'
import { notesRouter } from './routes/notes.js'
import { chatRouter } from './routes/chat.js'

export function createApp() {
  const app = express()
  const portalDist = fileURLToPath(new URL('../../portal/dist/', import.meta.url))

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: env.clientOrigin, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: false, limit: '20kb' }))
  app.use(pinoHttp({ logger }))

  app.get('/api', (request, response) => {
    response.json({
      ok: true,
      data: {
        name: 'echo-api',
        version: '0.1.0'
      }
    })
  })

  app.use('/api/health', healthRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/me', requireAuth, meRouter)
  app.use('/api/posts', requireAuth, postsRouter)
  app.use('/api/users', requireAuth, usersRouter)
  app.use('/api/search', requireAuth, searchRouter)
  app.use('/api/notifications', requireAuth, notificationsRouter)
  app.use('/api/channels', requireAuth, channelsRouter)
  app.use('/api/notes', requireAuth, notesRouter)
  app.use('/api/chat', requireAuth, chatRouter)
  app.use(express.static(portalDist, { index: 'index.html' }))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api')) {
      return next()
    }

    response.sendFile('index.html', { root: portalDist }, error => {
      if (error) {
        next()
      }
    })
  })
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
