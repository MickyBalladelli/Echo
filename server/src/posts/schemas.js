import { z } from 'zod'
import { paginationSchema } from '../http/validation.js'

const optionalId = z.string().uuid().optional().nullable()

export const createPostSchema = z.object({
  body: z.string().trim().min(1).max(280),
  channelId: optionalId,
  visibility: z.literal('public').default('public')
})

export const createReplySchema = z.object({
  body: z.string().trim().min(1).max(280)
})

export const postFeedSchema = paginationSchema.extend({
  feed: z.enum(['home', 'following']).default('home')
})
