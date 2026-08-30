import { z } from 'zod'

const username = z.string().trim().toLowerCase().min(3).max(32)

export const createConversationSchema = z.object({
  kind: z.enum(['direct', 'group']),
  usernames: z.array(username).min(1).max(20),
  title: z.string().trim().max(100).optional()
}).superRefine((value, context) => {
  if (value.kind === 'direct' && value.usernames.length !== 1) {
    context.addIssue({ code: 'custom', path: ['usernames'], message: 'Direct chat needs one other person' })
  }
  if (value.kind === 'group' && !value.title) {
    context.addIssue({ code: 'custom', path: ['title'], message: 'Group title required' })
  }
})

export const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) })
export const addMemberSchema = z.object({ username })
export const muteSchema = z.object({ muted: z.boolean(), notificationsEnabled: z.boolean().default(true) })
export const reportSchema = z.object({ reason: z.string().trim().min(3).max(500) })
