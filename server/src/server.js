import http from 'node:http'
import { Server } from 'socket.io'
import { createApp } from './app.js'
import { authenticateSocket } from './auth/middleware.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { pool } from './db/pool.js'
import { setNotificationEmitter } from './notifications/realtime.js'
import { initializeSocketRooms } from './realtime/rooms.js'
import { realtimeEnvelope, setRealtimePublisher } from './realtime/events.js'
import { initializeChatSocket } from './chat/socket.js'
import { heavyWorkJobQueue, notificationJobQueue } from './jobs/queue.js'
import { startScheduledPostWorker } from './posts/scheduled.js'

const app = createApp()
const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, !origin || env.clientOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST']
  },
  allowRequest: (request, callback) => {
    const origin = request.headers.origin
    callback(null, !origin || env.clientOrigins.includes(origin))
  },
  maxHttpBufferSize: env.maxSocketBufferBytes
})
const stopScheduledPostWorker = startScheduledPostWorker()

io.use(authenticateSocket)
setNotificationEmitter((recipientId, event) => {
  io.to(`user:${recipientId}`).emit(
    'notification:new',
    realtimeEnvelope('notification:new', event, `notification:${event.id}`)
  )
})
setRealtimePublisher((room, type, envelope) => io.to(room).emit(type, envelope))

io.on('connection', async socket => {
  logger.info({ socketId: socket.id, userId: socket.data.auth.userId }, 'Socket connected')

  try {
    await initializeSocketRooms(socket)
    initializeChatSocket(socket)
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Socket room setup failed')
    socket.disconnect(true)
    return
  }

  socket.on('disconnect', reason => {
    logger.info({ socketId: socket.id, reason }, 'Socket disconnected')
  })
})

httpServer.listen(env.port, () => {
  logger.info({ port: env.port }, 'Echo API listening')
})

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Shutting down')

  const timeout = setTimeout(() => {
    logger.error({ timeoutMs: env.shutdownTimeoutMs }, 'Graceful shutdown timed out')
    process.exitCode = 1
  }, env.shutdownTimeoutMs)
  timeout.unref()

  await new Promise(resolve => io.close(resolve))
  await new Promise(resolve => httpServer.close(error => {
    if (error) logger.error({ err: error }, 'HTTP server close failed')
    resolve()
  }))
  await Promise.all([notificationJobQueue.close(), heavyWorkJobQueue.close()])
  stopScheduledPostWorker()
  await pool.close()
  clearTimeout(timeout)
  logger.info('Shutdown complete')
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
