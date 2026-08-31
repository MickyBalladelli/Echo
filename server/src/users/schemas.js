import { z } from 'zod'

export const usernameSchema = z.string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_]+$/)

export const suggestionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(6)
})
