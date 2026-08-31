import { z } from 'zod'

const username = z.string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_]+$/)

const email = z.string().trim().toLowerCase().email().max(320)

const imageUrl = z.string().max(1900000).refine(value => {
  return /^https?:\/\//i.test(value) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)
}, 'Image must be a URL or an image data URL')

export const registerSchema = z.object({
  username,
  email,
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(280).default('')
})

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(128)
})

export const twoFactorCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
  challengeToken: z.string().min(20).max(200).optional()
})

export const tokenSchema = z.object({
  token: z.string().min(20).max(200)
})

export const passwordResetRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(320)
})

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(128)
})

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(280).default(''),
  avatarUrl: imageUrl.nullable().optional(),
  bannerUrl: imageUrl.nullable().optional(),
  profileVisibility: z.enum(['public', 'followers']).default('public'),
  showFollowers: z.boolean().default(true),
  showFollowing: z.boolean().default(true)
})

export const localeSchema = z.object({
  locale: z.enum(['en', 'fr', 'de', 'es', 'it', 'ja'])
})
