import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })
dotenv.config({ quiet: true })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_DIALECT: z.enum(['postgres', 'sqlite', 'turso']).default('postgres'),
  DATABASE_URL: z.string().min(1).optional(),
  SQLITE_PATH: z.string().min(1).default('./data/echo.sqlite'),
  TURSO_URL: z.string().min(1).optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  CLIENT_ORIGINS: z.string().optional(),
  GIPHY_API_KEY: z.string().trim().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_FORMAT: z.enum(['morgan', 'json']).default('morgan'),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  DB_PROFILE_SLOW_MS: z.coerce.number().int().min(10).max(30000).default(250),
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

const defaultClientOrigins = result.data.NODE_ENV === 'development'
  ? [result.data.CLIENT_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173']
  : [result.data.CLIENT_ORIGIN]
const clientOrigins = (result.data.CLIENT_ORIGINS
  ? result.data.CLIENT_ORIGINS.split(',')
  : defaultClientOrigins)
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

if (result.data.DB_DIALECT === 'postgres' && !result.data.DATABASE_URL) {
  throw new Error('Invalid environment: DATABASE_URL is required when DB_DIALECT=postgres')
}

if (result.data.DB_DIALECT === 'turso' && !result.data.TURSO_URL) {
  throw new Error('Invalid environment: TURSO_URL is required when DB_DIALECT=turso')
}

export const env = Object.freeze({
  nodeEnv: result.data.NODE_ENV,
  port: result.data.PORT,
  dbDialect: result.data.DB_DIALECT,
  databaseUrl: result.data.DATABASE_URL,
  sqlitePath: result.data.SQLITE_PATH,
  tursoUrl: result.data.TURSO_URL,
  tursoAuthToken: result.data.TURSO_AUTH_TOKEN,
  clientOrigin: result.data.CLIENT_ORIGIN,
  clientOrigins: Object.freeze(clientOrigins),
  giphyApiKey: result.data.GIPHY_API_KEY,
  logLevel: result.data.LOG_LEVEL,
  logFormat: result.data.LOG_FORMAT,
  dbQueryTimeoutMs: result.data.DB_QUERY_TIMEOUT_MS,
  dbConnectionTimeoutMs: result.data.DB_CONNECTION_TIMEOUT_MS,
  dbProfileSlowMs: result.data.DB_PROFILE_SLOW_MS,
  maxJsonBodyBytes: result.data.MAX_JSON_BODY_BYTES,
  maxSocketBufferBytes: result.data.MAX_SOCKET_BUFFER_BYTES,
  shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS
})
