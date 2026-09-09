import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import pinoHttp from 'pino-http'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { requireAuth } from './auth/middleware.js'
import { csrfProtection } from './auth/csrf.js'
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
import { moderationRouter } from './routes/moderation.js'
import { adminRouter } from './routes/admin.js'
import { gifsRouter } from './routes/gifs.js'

const ansi = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  gray: '\u001b[90m'
}

function paint(color, value) {
  if (!value || value === '-') return value || '-'
  return `${ansi[color]}${value}${ansi.reset}`
}

function colorStatus(status) {
  if (status >= 500) return 'red'
  if (status >= 400) return 'yellow'
  if (status >= 300) return 'cyan'
  if (status >= 200) return 'green'
  return 'gray'
}

function coloredMorganFormat(tokens, request, response) {
  const statusValue = tokens.status(request, response) || '-'
  const status = Number.parseInt(statusValue, 10)
  const method = tokens.method(request, response) || '-'
  const url = tokens.url(request, response) || '-'
  const protocol = tokens['http-version'](request, response) || '-'
  const responseSize = tokens.res(request, response, 'content-length') || '-'
  const referrer = tokens.referrer(request, response) || '-'
  const userAgent = tokens['user-agent'](request, response) || '-'
  const remoteAddress = tokens['remote-addr'](request, response) || '-'
  const date = tokens.date(request, response, 'clf') || '-'

  return [
    paint('magenta', remoteAddress),
    '- -',
    paint('dim', `[${date}]`),
    `"${paint('cyan', method)} ${paint('blue', url)} HTTP/${protocol}"`,
    paint(colorStatus(status), statusValue),
    responseSize,
    `"${paint('yellow', referrer)}"`,
    `"${paint('gray', userAgent)}"`
  ].join(' ') + '\n'
}

export function createApp() {
  const app = express()
  const portalDist = fileURLToPath(new URL('../../portal/dist/', import.meta.url))

  app.disable('x-powered-by')
  app.use(helmet({ hsts: env.nodeEnv === 'production' }))
  app.use(pinoHttp({
    logger,
    autoLogging: env.logFormat !== 'morgan',
    genReqId: request => {
      const requestId = String(request.headers['x-request-id'] || '')
      return /^[a-zA-Z0-9._-]{1,64}$/.test(requestId) ? requestId : randomUUID()
    },
    customProps: request => ({ userId: request.auth?.userId || undefined }),
    customSuccessMessage: (request, response) => `${request.method} ${request.originalUrl} ${response.statusCode}`
  }))
  if (env.logFormat === 'morgan') {
    app.use(morgan(coloredMorganFormat))
  }
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || env.clientOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id']
  }))
  app.use((request, response, next) => {
    response.setHeader('X-Request-Id', request.id)
    next()
  })
  app.use(csrfProtection)
  app.use(express.json({ limit: env.maxJsonBodyBytes }))
  app.use(express.urlencoded({ extended: false, limit: '20kb' }))

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
  app.use('/api/gifs', requireAuth, gifsRouter)
  app.use('/api/channels', requireAuth, channelsRouter)
  app.use('/api/notes', requireAuth, notesRouter)
  app.use('/api/chat', requireAuth, chatRouter)
  app.use('/api/moderation', requireAuth, moderationRouter)
  app.use('/api/admin', requireAuth, adminRouter)
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
