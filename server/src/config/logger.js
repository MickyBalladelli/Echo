import { Writable } from 'node:stream'
import pino from 'pino'
import { env } from './env.js'

const loggerOptions = {
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-csrf-token',
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
}

const levelNames = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL'
}

function formatValue(value) {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === undefined) return ''

  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function formatLogLine(chunk) {
  try {
    const entry = JSON.parse(chunk.toString())
    const timestamp = entry.time ? new Date(entry.time).toISOString() : new Date().toISOString()
    const level = levelNames[entry.level] || 'INFO'
    const message = entry.msg || ''
    const details = Object.entries(entry)
      .filter(([key, value]) => !['level', 'time', 'msg'].includes(key) && value !== undefined)
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(' ')

    return `${timestamp} ${level} ${message}${details ? ` ${details}` : ''}\n`
  } catch {
    return chunk.toString()
  }
}

function createReadableLogStream() {
  return new Writable({
    write(chunk, _encoding, callback) {
      process.stdout.write(formatLogLine(chunk), callback)
    }
  })
}

export const logger = env.logFormat === 'morgan'
  ? pino(loggerOptions, createReadableLogStream())
  : pino(loggerOptions)
