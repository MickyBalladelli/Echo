import { z } from 'zod'

export const adminRoleSchema = z.object({
  role: z.enum(['user', 'moderator', 'admin', 'developer'])
})

export const adminStatusSchema = z.object({
  status: z.enum(['active', 'suspended'])
})
