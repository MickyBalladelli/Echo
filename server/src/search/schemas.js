import { z } from 'zod'
import { paginationSchema } from '../http/validation.js'

export const searchSchema = paginationSchema.extend({
  q: z.string().trim().min(2).max(100),
  type: z.enum(['users', 'posts', 'channels', 'hashtags'])
})

export const explorePostsSchema = paginationSchema.extend({
  sort: z.enum(['recent', 'popular']).default('recent')
})
