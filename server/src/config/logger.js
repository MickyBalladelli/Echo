import pino from 'pino'
import { env } from './env.js'

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'data.password',
      'data.token'
    ],
    censor: '[REDACTED]'
  },
  base: {
    service: 'echo-api',
    environment: env.nodeEnv
  },
  serializers: {
    err: pino.stdSerializers.err
  }
})
