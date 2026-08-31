import { z } from 'zod'
import { channelChatAttachmentSchema } from '../channels/chat-schemas.js'

const uuid = z.string().uuid()

export const roomEventSchema = z.object({
  kind: z.enum(['channel', 'post', 'conversation']),
  id: uuid
})

export const chatMessageEventSchema = z.object({
  conversationId: uuid,
  body: z.string().trim().min(1).max(4000)
})

export const channelChatMessageEventSchema = z.object({
  channelId: uuid,
  body: z.string().trim().max(4000).default(''),
  attachments: z.array(channelChatAttachmentSchema).max(3).default([])
}).superRefine((value, context) => {
  if (!value.body && !value.attachments.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'Message or attachment is required' })
  }
})

export const typingEventSchema = z.object({
  conversationId: uuid,
  typing: z.boolean()
})

export const readEventSchema = z.object({
  conversationId: uuid,
  messageId: uuid
})

export const presenceListEventSchema = z.object({
  userIds: z.array(uuid).max(100)
})

export function parseSocketEvent(schema, value) {
  const result = schema.safeParse(value)
  return result.success ? result.data : null
}
