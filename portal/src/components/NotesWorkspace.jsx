import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { NoteEditor } from './NoteEditor.jsx'

export function NotesWorkspace({ router, noteId = null }) {
  const notes = signal([])
  const selected = signal(null)
  const nextCursor = signal(null)
  const state = signal('loading')
  const error = signal('')
  const query = signal('')
  const tag = signal('')
  const archived = signal(false)
  const loadingMore = signal(false)
  const creating = signal(false)

  async function loadNotes({ append = false } = {}) {
    if (append) loadingMore.value = true
    else state.value = 'loading'
    try {
      const parameters = new URLSearchParams({ limit: '30', archived: String(archived.value) })
      if (query.value.trim()) parameters.set('q', query.value.trim())
      if (tag.value.trim()) parameters.set('tag', tag.value.trim())
      if (append && nextCursor.value) parameters.set('cursor', nextCursor.value)
      const result = await apiRequest(`/api/notes?${parameters.toString()}`)
      notes.value = append ? [...notes.value, ...result.data] : result.data
      nextCursor.value = result.meta?.nextCursor || null
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load notes'
      state.value = 'error'
    } finally {
      loadingMore.value = false
    }
  }

  async function loadSelected(id = noteId) {
    if (!id) {
      selected.value = null
      return
    }
    try {
      const result = await apiRequest(`/api/notes/${encodeURIComponent(id)}`)
      selected.value = result.data.note
      return result.data.note
    } catch (requestError) {
      error.value = requestError.message || 'Could not load note'
      selected.value = null
      return null
    }
  }

  async function create() {
    creating.value = true
    error.value = ''
    try {
      const result = await apiRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: '', body: '', tags: [], visibility: 'private' })
      })
      notes.value = [result.data.note, ...notes.value]
      router.navigate(`/notes/${result.data.note.id}`)
    } catch (requestError) {
      error.value = requestError.message || 'Could not create note'
    } finally {
      creating.value = false
    }
  }

  function submitSearch(event) {
    event.preventDefault()
    loadNotes()
  }

  function updateNote(note) {
    selected.value = note
    notes.value = notes.value.map(item => item.id === note.id ? note : item)
  }

  function deleteNote(id) {
    notes.value = notes.value.filter(note => note.id !== id)
    selected.value = null
    router.navigate('/notes')
  }

  const noteList = computed(() => {
    if (state.value === 'loading') return <div role="status">Loading notes…</div>
    if (state.value === 'error') return <EmptyState status="error" title="Notes unavailable" description={error.value} />
    if (!notes.value.length) return <EmptyState title="No notes found" description="Create a note or change filters." />
    return (
      <div class="notes-list">
        {notes.value.map(note => (
          <a
            key={note.id}
            class={selected.value?.id === note.id ? 'note-list-item note-list-item-active' : 'note-list-item'}
            href={`/notes/${note.id}`}
            onClick={router.link(`/notes/${note.id}`)}
          >
            <strong>{note.isPinned ? '◆ ' : ''}{note.title || 'Untitled note'}</strong>
            <span>{note.body.slice(0, 80) || 'Empty note'}</span>
            <small>{note.tags.length ? note.tags.map(value => `#${value}`).join(' ') : note.visibility}</small>
          </a>
        ))}
      </div>
    )
  })
  const editor = computed(() => selected.value
    ? <NoteEditor
      note={selected.value}
      router={router}
      onSaved={updateNote}
      onDeleted={deleteNote}
      onReload={() => loadSelected(selected.value.id)}
    />
    : <Card class="notes-empty-editor"><EmptyState title="Choose a note" description="Open a note from the list or create one." /></Card>)
  const pagination = computed(() => nextCursor.value
    ? <Button variant="secondary" loading={loadingMore} onClick={() => loadNotes({ append: true })}>Load more</Button>
    : null)

  onMount(() => {
    loadNotes()
    loadSelected()
  })

  return (
    <div class="notes-workspace">
      <Card class="notes-sidebar">
        <div class="notes-sidebar-heading">
          <Label size="small" tone="accent">YOUR NOTES</Label>
          <Button size="small" loading={creating} onClick={create}>New note</Button>
        </div>
        <form class="notes-filter-form" onSubmit={submitSearch}>
          <FormField id="notes-search" label="Search"><TextField id="notes-search" value={query} maxLength={100} /></FormField>
          <FormField id="notes-tag" label="Tag"><TextField id="notes-tag" value={tag} maxLength={32} /></FormField>
          <CheckBox checked={archived}>Show archived</CheckBox>
          <Button type="submit" variant="secondary" size="small">Apply filters</Button>
        </form>
        {noteList}
        {pagination}
      </Card>
      {editor}
      <div class="post-feed-error" role="alert">{error}</div>
    </div>
  )
}
