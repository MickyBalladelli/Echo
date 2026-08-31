import { z } from 'zod'

export const channelChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000)
})
