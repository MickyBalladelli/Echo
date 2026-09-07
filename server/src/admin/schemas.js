import { z } from 'zod'

export const adminRoleSchema = z.object({
  role: z.enum(['user', 'moderator', 'admin'])
})

export const adminStatusSchema = z.object({
  status: z.enum(['active', 'suspended'])
})
