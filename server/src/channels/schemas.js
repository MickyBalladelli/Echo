import { z } from 'zod'

const channelFields = {
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().max(280).default(''),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  rules: z.string().trim().max(2000).default(''),
  postApprovalRequired: z.boolean().default(false)
}

export const createChannelSchema = z.object(channelFields)
export const updateChannelSchema = z.object(channelFields).partial().refine(value => Object.keys(value).length > 0)
export const channelSlugSchema = z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const channelInviteSchema = z.object({ username: z.string().trim().toLowerCase().min(3).max(32) })
export const channelRoleSchema = z.object({ role: z.enum(['moderator', 'member']) })
export const channelPreferencesSchema = z.object({
  muted: z.boolean(),
  notificationsEnabled: z.boolean()
})
export const channelModerationSchema = z.object({
  status: z.enum(['approved', 'rejected'])
})
export const channelPinnedPostSchema = z.object({
  postId: z.string().uuid().nullable()
})
