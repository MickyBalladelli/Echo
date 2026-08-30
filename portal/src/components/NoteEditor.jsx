import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function NoteEditor({ note, router, onSaved, onDeleted, onReload }) {
  const current = signal(note)
  const title = signal(note.title)
  const body = signal(note.body)
  const tags = signal(note.tags.join(', '))
  const shared = signal(note.visibility === 'shared')
  const pinned = signal(note.isPinned)
  const archived = signal(note.isArchived)
  const saveState = signal(note.canEdit ? 'saved' : 'read-only')
  const error = signal('')
  const saving = signal(false)
  let saveTimer
  let pendingSave = false

  function payload() {
    return {
      title: title.value,
      body: body.value,
      tags: [...new Set(tags.value.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))],
      visibility: shared.value ? 'shared' : 'private',
      isPinned: pinned.value,
      isArchived: archived.value,
      expectedVersion: current.value.version
    }
  }

  async function save() {
    if (!current.value.canEdit || saveState.value === 'conflict') return current.value
    if (saving.value) {
      pendingSave = true
      return current.value
    }
    clearTimeout(saveTimer)
    saving.value = true
    saveState.value = 'saving'
    error.value = ''
    try {
      const result = await apiRequest(`/api/notes/${encodeURIComponent(current.value.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload())
      })
      current.value = result.data.note
      saveState.value = 'saved'
      onSaved(result.data.note)
    } catch (requestError) {
      if (requestError.code === 'NOTE_CONFLICT') {
        saveState.value = 'conflict'
        error.value = 'Newer copy exists. Reload before editing more.'
      } else {
        saveState.value = 'error'
        error.value = requestError.message || 'Could not save note'
      }
    } finally {
      saving.value = false
      if (pendingSave && saveState.value !== 'conflict') {
        pendingSave = false
        scheduleSave()
      }
    }
    return current.value
  }

  function scheduleSave() {
    if (!current.value.canEdit || saveState.value === 'conflict') return
    clearTimeout(saveTimer)
    saveState.value = 'draft'
    saveTimer = setTimeout(save, 700)
  }

  async function remove() {
    if (!current.value.canEdit) return
    clearTimeout(saveTimer)
    try {
      await apiRequest(`/api/notes/${encodeURIComponent(current.value.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedVersion: current.value.version })
      })
      onDeleted(current.value.id)
    } catch (requestError) {
      error.value = requestError.message || 'Could not delete note'
      if (requestError.code === 'NOTE_CONFLICT') saveState.value = 'conflict'
    }
  }

  async function publish() {
    await save()
    if (saveState.value === 'conflict' || saveState.value === 'error') return
    try {
      const result = await apiRequest(`/api/notes/${encodeURIComponent(current.value.id)}/publish`, { method: 'POST' })
      router.navigate(`/posts/${result.data.post.id}`)
    } catch (requestError) {
      error.value = requestError.message || 'Could not publish note'
    }
  }

  async function reloadLatest() {
    const latest = await onReload()
    if (!latest) return
    current.value = latest
    title.value = latest.title
    body.value = latest.body
    tags.value = latest.tags.join(', ')
    shared.value = latest.visibility === 'shared'
    pinned.value = latest.isPinned
    archived.value = latest.isArchived
    saveState.value = latest.canEdit ? 'saved' : 'read-only'
    error.value = ''
  }

  const statusLabel = computed(() => ({
    draft: 'Draft',
    saving: 'Saving…',
    saved: 'Saved',
    conflict: 'Conflict',
    error: 'Save failed',
    'read-only': 'Shared · read only'
  })[saveState.value])

  onMount(() => {
    if (!current.value.canEdit) return
    const unsubscribers = [title, body, tags, shared, pinned, archived].map(value => value.subscribe(scheduleSave))
    return () => {
      clearTimeout(saveTimer)
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  })

  return (
    <Card class="note-editor">
      <div class="note-editor-heading">
        <Label
          size="small"
          tone="accent"
          class={computed(() => saveState.value === 'conflict' || saveState.value === 'error' ? 'note-save-status-error' : '')}
        >
          {statusLabel}
        </Label>
        {current.value.canEdit && (
          <div class="note-editor-actions">
            <Button variant="tertiary" size="small" onClick={() => pinned.value = !pinned.value}>{computed(() => pinned.value ? 'Unpin' : 'Pin')}</Button>
            <Button variant="tertiary" size="small" onClick={() => archived.value = !archived.value}>{computed(() => archived.value ? 'Restore' : 'Archive')}</Button>
            <Button variant="secondary" size="small" onClick={publish}>Publish as post</Button>
            <Button variant="error" size="small" onClick={remove}>Delete</Button>
          </div>
        )}
      </div>
      {current.value.canEdit
        ? (
          <div class="note-editor-fields">
            <FormField id="note-title" label="Title"><TextField id="note-title" value={title} maxLength={200} placeholder="Untitled note" /></FormField>
            <FormField id="note-tags" label="Tags" hint="Comma separated, up to 10"><TextField id="note-tags" value={tags} placeholder="ideas, work" /></FormField>
            <FormField id="note-body" label="Body">
              <textarea id="note-body" class="note-body-input" use:bind={body} maxlength="20000" rows="16" placeholder="Start writing…" />
            </FormField>
            <CheckBox checked={shared}>Anyone with this note link can read it</CheckBox>
          </div>
        )
        : (
          <div class="shared-note-body">
            <h2>{current.value.title || 'Untitled note'}</h2>
            <p>{current.value.body}</p>
          </div>
        )}
      {saveState.value === 'conflict' && <Button variant="warning" onClick={reloadLatest}>Reload newer copy</Button>}
      <div class="post-feed-error" role="alert">{error}</div>
    </Card>
  )
}
