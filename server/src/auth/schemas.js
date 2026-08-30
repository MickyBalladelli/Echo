import { z } from 'zod'

const username = z.string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_]+$/)

const email = z.string().trim().toLowerCase().email().max(320)

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

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(280).default(''),
  avatarUrl: z.string().url().max(2000).nullable().optional(),
  bannerUrl: z.string().url().max(2000).nullable().optional()
})
