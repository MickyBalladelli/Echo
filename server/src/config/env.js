import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5000'),
  CLIENT_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  MAX_JSON_BODY_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(2 * 1024 * 1024),
  MAX_SOCKET_BUFFER_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(2 * 1024 * 1024),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000)
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  const details = result.error.issues
    .map(issue => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join(', ')

  throw new Error(`Invalid environment: ${details}`)
}

const clientOrigins = (result.data.CLIENT_ORIGINS || result.data.CLIENT_ORIGIN)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

if (clientOrigins.some(origin => {
  try {
    const parsed = new URL(origin)
    return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin
  } catch {
    return true
  }
})) {
  throw new Error('Invalid environment: CLIENT_ORIGINS must contain HTTP(S) URLs')
}

export const env = Object.freeze({
  nodeEnv: result.data.NODE_ENV,
  port: result.data.PORT,
  databaseUrl: result.data.DATABASE_URL,
  clientOrigin: result.data.CLIENT_ORIGIN,
  clientOrigins: Object.freeze(clientOrigins),
  logLevel: result.data.LOG_LEVEL,
  dbQueryTimeoutMs: result.data.DB_QUERY_TIMEOUT_MS,
  dbConnectionTimeoutMs: result.data.DB_CONNECTION_TIMEOUT_MS,
  maxJsonBodyBytes: result.data.MAX_JSON_BODY_BYTES,
  maxSocketBufferBytes: result.data.MAX_SOCKET_BUFFER_BYTES,
  shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS
})
