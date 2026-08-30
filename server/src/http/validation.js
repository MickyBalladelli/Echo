import { z } from 'zod'
import { HttpError } from './errors.js'

export const idSchema = z.string().uuid()

export const paginationSchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export const timestampSchema = z.string().datetime({ offset: true })

export function parse(schema, value, label = 'request') {
  const result = schema.safeParse(value)

  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${label}`, result.error.flatten())
  }

  return result.data
}
