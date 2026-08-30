import { Router } from 'express'
import { ok, cursorMeta } from '../http/api.js'
import { idSchema, parse } from '../http/validation.js'
import { createNoteSchema, deleteNoteSchema, noteListSchema, updateNoteSchema } from '../notes/schemas.js'
import { createNote, decodeNoteCursor, deleteNote, getNote, listNotes, publishNote, updateNote } from '../notes/service.js'

export const notesRouter = Router()

notesRouter.get('/', async (request, response, next) => {
  try {
    const page = parse(noteListSchema, request.query, 'notes query')
    const result = await listNotes(request.auth.userId, {
      ...page,
      cursor: decodeNoteCursor(page.cursor)
    })
    response.json(ok(result.notes, cursorMeta(result.nextCursor)))
  } catch (error) {
    next(error)
  }
})

notesRouter.post('/', async (request, response, next) => {
  try {
    const input = parse(createNoteSchema, request.body, 'note request')
    response.status(201).json(ok({ note: await createNote(request.auth.userId, input) }))
  } catch (error) {
    next(error)
  }
})

notesRouter.post('/:id/publish', async (request, response, next) => {
  try {
    const noteId = parse(idSchema, request.params.id, 'note id')
    response.status(201).json(ok({ post: await publishNote(request.auth.userId, noteId) }))
  } catch (error) {
    next(error)
  }
})

notesRouter.get('/:id', async (request, response, next) => {
  try {
    const noteId = parse(idSchema, request.params.id, 'note id')
    response.json(ok({ note: await getNote(request.auth.userId, noteId) }))
  } catch (error) {
    next(error)
  }
})

notesRouter.patch('/:id', async (request, response, next) => {
  try {
    const noteId = parse(idSchema, request.params.id, 'note id')
    const input = parse(updateNoteSchema, request.body, 'note update request')
    response.json(ok({ note: await updateNote(request.auth.userId, noteId, input) }))
  } catch (error) {
    next(error)
  }
})

notesRouter.delete('/:id', async (request, response, next) => {
  try {
    const noteId = parse(idSchema, request.params.id, 'note id')
    const input = parse(deleteNoteSchema, request.body, 'note delete request')
    response.json(ok({ note: await deleteNote(request.auth.userId, noteId, input.expectedVersion) }))
  } catch (error) {
    next(error)
  }
})
