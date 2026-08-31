import { z } from 'zod'

const uuid = z.string().uuid()

export const roomEventSchema = z.object({
  kind: z.enum(['channel', 'post', 'conversation']),
  id: uuid
})

export const chatMessageEventSchema = z.object({
  conversationId: uuid,
  body: z.string().trim().min(1).max(4000)
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
