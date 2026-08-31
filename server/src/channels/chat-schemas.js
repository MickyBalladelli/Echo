import { z } from 'zod'

const maxAttachmentBytes = 1024 * 1024

export const channelChatAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(127),
  size: z.number().int().min(0).max(maxAttachmentBytes),
  data: z.string().regex(/^data:[^;,]+;base64,[A-Za-z0-9+/]*={0,2}$/)
})

export const channelChatMessageSchema = z.object({
  body: z.string().trim().max(4000).default(''),
  attachments: z.array(channelChatAttachmentSchema).max(3).default([])
}).superRefine((value, context) => {
  if (!value.body && !value.attachments.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'Message or attachment is required' })
  }
})
