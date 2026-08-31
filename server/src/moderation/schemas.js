import { z } from 'zod'

export const targetTypeSchema = z.enum(['post', 'user', 'channel', 'message'])

export const reportSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500)
})

export const appealSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500)
})

export const reviewReportSchema = z.object({
  action: z.enum(['remove', 'dismiss', 'restore']),
  note: z.string().trim().max(500).default('')
})

export const reviewAppealSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  note: z.string().trim().max(500).default('')
})
