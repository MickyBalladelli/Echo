import { z } from 'zod'

const optionalId = z.string().uuid().optional().nullable()

export const createPostSchema = z.object({
  body: z.string().trim().min(1).max(280),
  parentPostId: optionalId,
  channelId: optionalId,
  visibility: z.literal('public').default('public')
})
