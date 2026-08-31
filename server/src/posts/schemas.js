import { z } from 'zod'
import { paginationSchema } from '../http/validation.js'

const optionalId = z.string().uuid().optional().nullable()
const visibility = z.enum(['public', 'followers', 'private'])
const imageUrl = z.string()
  .max(1500000)
  .refine(value => /^data:image\/(png|jpeg|webp);base64,/i.test(value) || /^https?:\/\//i.test(value), 'Image must be a web URL or supported image data')
const hashtag = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,64}$/)

const postInput = z.object({
  body: z.string().trim().max(20000).default(''),
  postFormat: z.enum(['short', 'long']).default('short'),
  channelId: optionalId,
  visibility: visibility.default('public'),
  repostOfPostId: optionalId,
  imageUrl: imageUrl.optional().nullable(),
  imageAltText: z.string().trim().max(120).optional().nullable(),
  contentWarning: z.string().trim().max(120).optional().nullable()
})

function withPostFormatRules(schema) {
  return schema.superRefine((value, context) => {
  if (value.postFormat === 'short' && value.body.length > 280) {
    context.addIssue({ code: 'custom', path: ['body'], message: 'Short posts are limited to 280 characters' })
  }
  })
}

export const createPostSchema = withPostFormatRules(postInput).superRefine((value, context) => {
  if (!value.body && !value.repostOfPostId) {
    context.addIssue({ code: 'custom', path: ['body'], message: 'Write something or choose a post to repost' })
  }
})

export const updatePostSchema = withPostFormatRules(z.object({
  body: z.string().trim().max(20000),
  postFormat: z.enum(['short', 'long']).optional(),
  visibility: visibility.optional(),
  imageUrl: imageUrl.optional().nullable(),
  imageAltText: z.string().trim().max(120).optional().nullable(),
  contentWarning: z.string().trim().max(120).optional().nullable()
}))

export const createReplySchema = z.object({
  body: z.string().trim().min(1).max(280)
})

export const postBodySchema = z.object({
  body: z.string().trim().min(1).max(280)
})

export const postFeedSchema = paginationSchema.extend({
  feed: z.enum(['home', 'following']).default('home'),
  hashtag: hashtag.optional()
})

export const draftQuerySchema = z.object({
  channelId: optionalId
})

export const draftSchema = withPostFormatRules(postInput.omit({ repostOfPostId: true }).extend({
  body: z.string().trim().max(20000).default('')
}))

export const pinnedPostSchema = z.object({
  postId: z.string().uuid().nullable()
})

export const scheduledPostSchema = withPostFormatRules(postInput.extend({
  scheduledAt: z.string().datetime({ offset: true })
}))

export const pollSchema = z.object({
  question: z.string().trim().min(1).max(240),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(4),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable()
}).superRefine((value, context) => {
  if (new Set(value.options.map(option => option.toLowerCase())).size !== value.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Poll options must be unique' })
  }
})

export { hashtag, postInput }
