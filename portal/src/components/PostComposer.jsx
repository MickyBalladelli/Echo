import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { clearOfflineDraft, readOfflineDraft, writeOfflineDraft } from '../lib/offline-drafts.js'

const maxPostLength = 280
const maxLongPostLength = 20000
const maxImageBytes = 10 * 1024 * 1024

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
  const postFormat = signal('short')
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
  const scheduledAt = signal('')
  const pollQuestion = signal('')
  const pollOptions = signal(['', ''])
  const pollEnabled = signal(false)
  const maxLength = computed(() => postFormat.value === 'long' ? maxLongPostLength : maxPostLength)
  const remaining = computed(() => maxLength.value - body.value.length)
  let draftTimer
  let loaded = false

  function offlineScope() {
    return channelId || 'home'
  }

  function currentDraft() {
    return {
      body: body.value,
      postFormat: postFormat.value,
      channelId,
      visibility: visibility.value,
      imageUrl: imageUrl.value || null,
      imageAltText: imageAltText.value.trim() || null,
      contentWarning: contentWarning.value.trim() || null
    }
  }

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
    writeOfflineDraft(offlineScope(), currentDraft())
    try {
      await apiRequest(draftPath(), {
        method: 'PUT',
        body: JSON.stringify({
          body: body.value,
          postFormat: postFormat.value,
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
    writeOfflineDraft(offlineScope(), currentDraft())
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
    postFormat.value = 'short'
    visibility.value = 'public'
    contentWarning.value = ''
    imageUrl.value = ''
    imageAltText.value = ''
    imageName.value = ''
    scheduledAt.value = ''
    pollQuestion.value = ''
    pollOptions.value = ['', '']
    pollEnabled.value = false
    clearOfflineDraft(offlineScope())
    draftStatus.value = 'saved'
  }

  async function selectImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      error.value = 'Choose an image file.'
      return
    }
    if (file.size > maxImageBytes) {
      error.value = 'Choose an image smaller than 10 MB.'
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
      const cleanOptions = pollOptions.value.map(option => option.trim()).filter(Boolean)
      if (pollEnabled.value && (!pollQuestion.value.trim() || cleanOptions.length < 2)) {
        error.value = 'Add a poll question and at least two options.'
        busy.value = false
        return
      }
      const wasScheduled = Boolean(scheduledAt.value)
      const hadPoll = pollEnabled.value
      const pollPayload = { question: pollQuestion.value.trim(), options: cleanOptions }
      const payload = {
        body: trimmedBody,
        ...(channelId ? { channelId } : {}),
        postFormat: postFormat.value,
        visibility: visibility.value,
        imageUrl: imageUrl.value || null,
        imageAltText: imageAltText.value.trim() || null,
        contentWarning: contentWarning.value.trim() || null
      }
      const result = await apiRequest(wasScheduled ? '/api/posts/scheduled' : '/api/posts', {
        method: 'POST',
        body: JSON.stringify(wasScheduled
          ? { ...payload, scheduledAt: new Date(scheduledAt.value).toISOString() }
          : payload)
      })
      await apiRequest(draftPath(), { method: 'DELETE' }).catch(() => {})
      clearOfflineDraft(offlineScope())
      let createdPost = result.data.post
      if (!wasScheduled && hadPoll && createdPost) {
        const pollResult = await apiRequest(`/api/posts/${encodeURIComponent(createdPost.id)}/poll`, {
          method: 'POST',
          body: JSON.stringify(pollPayload)
        })
        createdPost = { ...createdPost, poll: pollResult.data.poll }
      }
      body.value = ''
      postFormat.value = 'short'
      visibility.value = 'public'
      contentWarning.value = ''
      imageUrl.value = ''
      imageAltText.value = ''
      imageName.value = ''
      scheduledAt.value = ''
      pollQuestion.value = ''
      pollOptions.value = ['', '']
      pollEnabled.value = false
      draftStatus.value = 'saved'
      if (createdPost) onCreated(createdPost)
    } catch (requestError) {
      error.value = requestError.message || 'Could not publish post'
    } finally {
      busy.value = false
    }
  }

  onMount(() => {
    let active = true
    const localDraft = readOfflineDraft(offlineScope())
    if (localDraft) {
      body.value = localDraft.body || ''
      postFormat.value = localDraft.postFormat || 'short'
      visibility.value = localDraft.visibility || 'public'
      contentWarning.value = localDraft.contentWarning || ''
      imageUrl.value = localDraft.imageUrl || ''
      imageAltText.value = localDraft.imageAltText || ''
      imageName.value = localDraft.imageUrl ? 'Offline saved image' : ''
      draftStatus.value = 'Offline draft restored'
    }
    const unsubscribers = [body, postFormat, visibility, contentWarning, imageUrl, imageAltText].map(value => value.subscribe(scheduleDraft))
    apiRequest(draftPath())
      .then(result => {
        if (!active) return
        const draft = result.data.draft
        if (draft && !localDraft) {
          body.value = draft.body || ''
          postFormat.value = draft.postFormat || 'short'
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
        draftStatus.value = localDraft ? 'Offline draft' : 'error'
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
  })[draftStatus.value] || draftStatus.value)

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
          maxlength={maxLength}
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
            Format
            <select use:bind={postFormat} aria-label="Post format">
              <option value="short">Short post</option>
              <option value="long">Long-form post</option>
            </select>
          </label>
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
          <label class="post-warning-toggle">
            Schedule
            <input type="datetime-local" use:bind={scheduledAt} aria-label="Schedule post" />
          </label>
          {!channelId && <label class="post-poll-toggle">
            <input type="checkbox" checked={pollEnabled} onChange={event => pollEnabled.value = event.target.checked} />
            Add poll
          </label>}
        </div>
        {pollEnabled.value && <div class="post-poll-composer">
          <input type="text" use:bind={pollQuestion} maxlength="240" placeholder="Poll question" aria-label="Poll question" />
          {pollOptions.value.map((option, index) => (
            <input
              key={index}
              type="text"
              value={option}
              maxlength="120"
              placeholder={`Option ${index + 1}`}
              aria-label={`Poll option ${index + 1}`}
              onInput={event => pollOptions.value = pollOptions.value.map((item, itemIndex) => itemIndex === index ? event.target.value : item)}
            />
          ))}
          {pollOptions.value.length < 4 && <Button type="button" variant="tertiary" size="small" onClick={() => pollOptions.value = [...pollOptions.value, '']}>Add option</Button>}
        </div>}
        {imageBusy.value && <div role="status">Preparing image…</div>}
        {imageUrl.value && (
          <div class="post-image-preview">
            <img src={imageUrl} alt={imageAltText.value || 'Selected image preview'} decoding="async" />
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
            <Button type="submit" loading={busy}>{scheduledAt.value ? 'Schedule' : 'Post'}</Button>
          </div>
        </div>
      </form>
    </Card>
  )
}
