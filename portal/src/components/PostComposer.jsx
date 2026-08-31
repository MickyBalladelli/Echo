import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

const maxPostLength = 280

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Could not read image'))
      image.onload = () => {
        const maxDimension = 1600
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function PostComposer({ onCreated, channelId = null }) {
  const body = signal('')
  const visibility = signal('public')
  const contentWarning = signal('')
  const imageUrl = signal('')
  const imageAltText = signal('')
  const imageName = signal('')
  const busy = signal(false)
  const imageBusy = signal(false)
  const error = signal('')
  const draftStatus = signal('loading')
  const mentionSuggestions = signal([])
  const mentionLoading = signal(false)
  const remaining = computed(() => maxPostLength - body.value.length)
  let draftTimer
  let loaded = false

  function draftPath() {
    const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''
    return `/api/me/post-draft${query}`
  }

  async function saveDraft() {
    if (!loaded) return
    const hasDraft = body.value.trim() || imageUrl.value
    if (!hasDraft) {
      draftStatus.value = 'saved'
      return
    }
    draftStatus.value = 'saving'
    try {
      await apiRequest(draftPath(), {
        method: 'PUT',
        body: JSON.stringify({
          body: body.value,
          channelId,
          visibility: visibility.value,
          imageUrl: imageUrl.value || null,
          imageAltText: imageAltText.value.trim() || null,
          contentWarning: contentWarning.value.trim() || null
        })
      })
      draftStatus.value = 'saved'
    } catch {
      draftStatus.value = 'error'
    }
  }

  function scheduleDraft() {
    if (!loaded) return
    clearTimeout(draftTimer)
    draftStatus.value = 'draft'
    draftTimer = setTimeout(saveDraft, 700)
  }

  async function clearDraft() {
    clearTimeout(draftTimer)
    try {
      await apiRequest(draftPath(), { method: 'DELETE' })
    } catch {
      draftStatus.value = 'error'
    }
    body.value = ''
    visibility.value = 'public'
    contentWarning.value = ''
    imageUrl.value = ''
    imageAltText.value = ''
    imageName.value = ''
    draftStatus.value = 'saved'
  }

  async function selectImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      error.value = 'Choose an image file.'
      return
    }
    imageBusy.value = true
    error.value = ''
    try {
      imageUrl.value = await resizeImage(file)
      imageName.value = file.name
      scheduleDraft()
    } catch (requestError) {
      error.value = requestError.message || 'Could not prepare image'
    } finally {
      imageBusy.value = false
    }
  }

  async function findMention() {
    const match = body.value.match(/(?:^|\s)@([a-z0-9_]*)$/i)
    if (!match || match[1].length < 1) {
      mentionSuggestions.value = []
      return
    }
    mentionLoading.value = true
    try {
      const result = await apiRequest(`/api/search?q=${encodeURIComponent(match[1])}&type=users&limit=5`)
      mentionSuggestions.value = result.data
    } catch {
      mentionSuggestions.value = []
    } finally {
      mentionLoading.value = false
    }
  }

  function insertMention(user) {
    const match = body.value.match(/(?:^|\s)@([a-z0-9_]*)$/i)
    if (!match) return
    const start = body.value.length - match[0].length
    const prefix = body.value.slice(0, start)
    const separator = match[0].startsWith(' ') ? ' ' : ''
    body.value = `${prefix}${separator}@${user.username} `
    mentionSuggestions.value = []
  }

  async function submit(event) {
    event.preventDefault()
    const trimmedBody = body.value.trim()

    if (!trimmedBody) {
      error.value = 'Write something first.'
      return
    }

    error.value = ''
    busy.value = true

    try {
      const result = await apiRequest('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          body: trimmedBody,
          ...(channelId ? { channelId } : {}),
          visibility: visibility.value,
          imageUrl: imageUrl.value || null,
          imageAltText: imageAltText.value.trim() || null,
          contentWarning: contentWarning.value.trim() || null
        })
      })
      await apiRequest(draftPath(), { method: 'DELETE' }).catch(() => {})
      body.value = ''
      visibility.value = 'public'
      contentWarning.value = ''
      imageUrl.value = ''
      imageAltText.value = ''
      imageName.value = ''
      draftStatus.value = 'saved'
      onCreated(result.data.post)
    } catch (requestError) {
      error.value = requestError.message || 'Could not publish post'
    } finally {
      busy.value = false
    }
  }

  onMount(() => {
    let active = true
    const unsubscribers = [body, visibility, contentWarning, imageUrl, imageAltText].map(value => value.subscribe(scheduleDraft))
    apiRequest(draftPath())
      .then(result => {
        if (!active) return
        const draft = result.data.draft
        if (draft) {
          body.value = draft.body || ''
          visibility.value = draft.visibility || 'public'
          contentWarning.value = draft.contentWarning || ''
          imageUrl.value = draft.imageUrl || ''
          imageAltText.value = draft.imageAltText || ''
          imageName.value = draft.imageUrl ? 'Saved image' : ''
          draftStatus.value = 'saved'
        } else {
          draftStatus.value = 'saved'
        }
      })
      .catch(() => {
        draftStatus.value = 'error'
      })
      .finally(() => {
        loaded = true
        if (body.value.trim() || imageUrl.value) scheduleDraft()
      })

    return () => {
      active = false
      clearTimeout(draftTimer)
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  })

  const draftLabel = computed(() => ({
    loading: 'Loading draft…',
    draft: 'Draft',
    saving: 'Saving…',
    saved: 'Draft saved',
    error: 'Draft unavailable'
  })[draftStatus.value])

  return (
    <Card class="post-composer">
      <div class="post-composer-heading">
        <div>
          <Label size="small" tone="accent">{channelId ? 'WRITE / CHANNEL POST' : 'WRITE / POST'}</Label>
          <h2>{channelId ? 'Post to channel' : 'Send a signal'}</h2>
        </div>
        <div class="post-composer-status">
          <span>{draftLabel}</span>
          <span class={computed(() => remaining.value < 40 ? 'post-character-count post-character-count-warning' : 'post-character-count')}>
            {remaining} left
          </span>
        </div>
      </div>
      <form onSubmit={submit}>
        <textarea
          class="post-composer-input"
          use:bind={body}
          maxlength={maxPostLength}
          rows="4"
          placeholder="What is happening? Add #hashtags or a link."
          aria-label="Post text"
          onInput={findMention}
        />
        {(mentionLoading.value || mentionSuggestions.value.length > 0) && (
          <div class="mention-suggestions" role="listbox" aria-label="Mention suggestions">
            {mentionLoading.value
              ? <span role="status">Finding people…</span>
              : mentionSuggestions.value.map(user => (
                <button key={user.id} type="button" role="option" onClick={() => insertMention(user)}>
                  <strong>{user.profile.displayName}</strong> <span>@{user.username}</span>
                </button>
              ))}
          </div>
        )}
        <div class="post-composer-options">
          <label>
            Visibility
            <select use:bind={visibility} aria-label="Post visibility">
              <option value="public">Public</option>
              <option value="followers">Followers</option>
              <option value="private">Only me</option>
            </select>
          </label>
          <label class="post-image-picker">
            Add image
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectImage} />
          </label>
          <label class="post-warning-toggle">
            Content warning
            <input type="text" use:bind={contentWarning} maxlength="120" placeholder="Optional" aria-label="Content warning" />
          </label>
        </div>
        {imageBusy.value && <div role="status">Preparing image…</div>}
        {imageUrl.value && (
          <div class="post-image-preview">
            <img src={imageUrl} alt={imageAltText.value || 'Selected image preview'} />
            <div>
              <span>{imageName}</span>
              <input type="text" use:bind={imageAltText} maxlength="120" placeholder="Describe the image" aria-label="Image description" />
              <Button type="button" variant="tertiary" size="small" onClick={() => { imageUrl.value = ''; imageName.value = '' }}>Remove image</Button>
            </div>
          </div>
        )}
        <div class="post-composer-footer">
          <div class="post-composer-error" role="alert" aria-live="polite">{error}</div>
          <div class="post-composer-actions">
            <Button type="button" variant="tertiary" size="small" onClick={clearDraft}>Clear draft</Button>
            <Button type="submit" loading={busy}>Post</Button>
          </div>
        </div>
      </form>
    </Card>
  )
}
