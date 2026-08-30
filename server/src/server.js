import http from 'node:http'
import { Server } from 'socket.io'
import { createApp } from './app.js'
import { authenticateSocket } from './auth/middleware.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { pool } from './db/pool.js'
import { setNotificationEmitter } from './notifications/realtime.js'

const app = createApp()
const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: env.clientOrigin,
    credentials: true
  }
})

io.use(authenticateSocket)
setNotificationEmitter((recipientId, event) => {
  io.to(`user:${recipientId}`).emit('notification:new', event)
})

io.on('connection', socket => {
  socket.join(`user:${socket.data.auth.userId}`)
  logger.info({ socketId: socket.id, userId: socket.data.auth.userId }, 'Socket connected')

  socket.on('disconnect', reason => {
    logger.info({ socketId: socket.id, reason }, 'Socket disconnected')
  })
})

httpServer.listen(env.port, () => {
  logger.info({ port: env.port }, 'Echo API listening')
})

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down')

  io.close()
  httpServer.close(async error => {
    if (error) {
      logger.error({ err: error }, 'HTTP server close failed')
      process.exitCode = 1
    }

    await pool.close()
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
