import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  const details = result.error.issues
    .map(issue => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join(', ')

  throw new Error(`Invalid environment: ${details}`)
}

export const env = Object.freeze({
  nodeEnv: result.data.NODE_ENV,
  port: result.data.PORT,
  databaseUrl: result.data.DATABASE_URL,
  clientOrigin: result.data.CLIENT_ORIGIN,
  logLevel: result.data.LOG_LEVEL
})
