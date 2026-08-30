import { z } from 'zod'
import { paginationSchema } from '../http/validation.js'

const tags = z.array(z.string().trim().toLowerCase().min(1).max(32)).max(10)

export const createNoteSchema = z.object({
  title: z.string().trim().max(200).default(''),
  body: z.string().max(20000).default(''),
  tags: tags.default([]),
  visibility: z.enum(['private', 'shared']).default('private')
})

export const updateNoteSchema = z.object({
  title: z.string().trim().max(200).optional(),
  body: z.string().max(20000).optional(),
  tags: tags.optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  isArchived: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  expectedVersion: z.number().int().positive()
})

export const deleteNoteSchema = z.object({ expectedVersion: z.number().int().positive() })

export const noteListSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().toLowerCase().max(32).optional(),
  archived: z.enum(['true', 'false']).default('false')
})
