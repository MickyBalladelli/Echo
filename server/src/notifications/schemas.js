import { z } from 'zod'

const notificationType = z.enum([
  'reply',
  'like',
  'follow',
  'channel_invite',
  'channel_join',
  'channel_post',
  'chat_message'
])

export const notificationPreferencesSchema = z.object({
  preferences: z.array(z.object({
    type: notificationType,
    enabled: z.boolean()
  })).min(1).max(7).superRefine((preferences, context) => {
    const types = preferences.map(preference => preference.type)
    if (new Set(types).size !== types.length) {
      context.addIssue({ code: 'custom', message: 'Each notification type can appear only once' })
    }
  })
})

export const emailPreferencesSchema = z.object({
  enabled: z.boolean(),
  digestFrequency: z.enum(['never', 'daily', 'weekly'])
})

export const notificationGroupKeySchema = z.string().trim().min(1).max(255)
