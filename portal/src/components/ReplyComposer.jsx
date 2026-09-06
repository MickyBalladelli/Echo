import { computed, signal } from '../lib/vendor.js'
import { Button, Card, IconButton, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { mediaSrc, removeAttachedGifUrl } from '../lib/media.js'
import { ChannelReactionPicker } from './ChannelReactionPicker.jsx'

export function ReplyComposer({ replyTarget, onCreated, onCancel }) {
  const body = signal('')
  const imageUrl = signal('')
  const imageAltText = signal('')
  const imageName = signal('')
  const busy = signal(false)
  const error = signal('')
  const richPickerOpen = signal(false)
  const richPickerPosition = signal(null)
  const targetName = computed(() => replyTarget.value?.author?.displayName || 'this thread')
  const targetDepth = computed(() => replyTarget.value?.depth || 0)
  const targetLabel = computed(() => `Reply to ${targetName.value}`)
  const cancelButton = computed(() => targetDepth.value > 0
    ? <Button type="button" variant="tertiary" size="small" onClick={cancel}>Reply to post</Button>
    : null)
  let bodyInput = null

  function closeRichPicker() {
    richPickerOpen.value = false
    richPickerPosition.value = null
  }

  function toggleRichPicker(event) {
    if (richPickerOpen.value) {
      closeRichPicker()
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const popupWidth = Math.min(360, window.innerWidth - 32)
    const popupHeight = Math.min(480, window.innerHeight * 0.7)
    const top = rect.top >= popupHeight + 20
      ? rect.top - popupHeight - 8
      : Math.min(window.innerHeight - popupHeight - 12, rect.bottom + 8)
    const left = Math.min(window.innerWidth - popupWidth - 12, Math.max(12, rect.right - popupWidth))

    richPickerPosition.value = { top: Math.max(12, top), left }
    richPickerOpen.value = true
  }

  function insertRichText(value) {
    const currentBody = body.value
    const start = typeof bodyInput?.selectionStart === 'number' ? bodyInput.selectionStart : currentBody.length
    const end = typeof bodyInput?.selectionEnd === 'number' ? bodyInput.selectionEnd : start
    body.value = `${currentBody.slice(0, start)}${value}${currentBody.slice(end)}`
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        bodyInput?.focus()
        const cursor = start + value.length
        bodyInput?.setSelectionRange(cursor, cursor)
      })
    }
  }

  function selectRichContent({ type, value, label }) {
    if (type === 'gif') {
      imageUrl.value = value
      imageName.value = `GIF · ${label}`
      imageAltText.value = label
    } else {
      insertRichText(value)
    }
  }

  async function submit(event) {
    event.preventDefault()
    const target = replyTarget.value
    const trimmedBody = removeAttachedGifUrl(body.value, imageUrl.value)

    if (!target) {
      error.value = 'Choose a post to reply to.'
      return
    }

    if (!trimmedBody && !imageUrl.value) {
      error.value = 'Write a reply or add a GIF first.'
      return
    }

    error.value = ''
    busy.value = true

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(target.id)}/replies`, {
        method: 'POST',
        body: JSON.stringify({
          body: trimmedBody,
          imageUrl: imageUrl.value || null,
          imageAltText: imageAltText.value.trim() || null
        })
      })
      body.value = ''
      imageUrl.value = ''
      imageAltText.value = ''
      imageName.value = ''
      closeRichPicker()
      onCreated(result.data.reply)
    } catch (requestError) {
      error.value = requestError.message || 'Could not publish reply'
    } finally {
      busy.value = false
    }
  }

  function cancel() {
    body.value = ''
    imageUrl.value = ''
    imageAltText.value = ''
    imageName.value = ''
    closeRichPicker()
    error.value = ''
    onCancel()
  }

  return (
    <Card class="reply-composer">
      <div class="reply-composer-heading">
        <div>
          <Label size="small" tone="accent">REPLY / THREAD</Label>
          <h2>Reply to {targetName}</h2>
        </div>
        {cancelButton}
      </div>
      <form onSubmit={submit}>
        <textarea
          class="post-composer-input"
          use:bind={body}
          maxlength="280"
          rows="3"
          placeholder="Add to the conversation"
          aria-label={targetLabel}
          onFocus={event => bodyInput = event.currentTarget}
        />
        {imageUrl.value && (
          <div class="post-image-preview reply-image-preview">
            <img src={mediaSrc(imageUrl.value)} alt={imageAltText.value || 'Selected GIF preview'} decoding="async" />
            <div>
              <span>{imageName}</span>
              <TextField value={imageAltText} maxLength={120} placeholder="Describe the GIF" ariaLabel="GIF description" />
              <Button type="button" variant="tertiary" size="small" onClick={() => { imageUrl.value = ''; imageAltText.value = ''; imageName.value = '' }}>Remove GIF</Button>
            </div>
          </div>
        )}
        <ChannelReactionPicker
          open={richPickerOpen}
          position={richPickerPosition}
          onSelect={selectRichContent}
          onClose={closeRichPicker}
          canUseRichReactions
          panelTitle="Add to reply"
          dialogLabel="Add content to reply"
          selectionVerb="Add"
        />
        <div class="post-composer-footer">
          <div class="post-composer-error" role="alert" aria-live="polite">{error}</div>
          <div class="post-composer-actions reply-composer-actions">
            <IconButton
              class="reply-composer-rich-toggle"
              variant="tertiary"
              type="button"
              icon="😀"
              ariaLabel="Add emoji, sticker, or GIF"
              title="Add emoji, sticker, or GIF"
              pressed={richPickerOpen}
              onClick={toggleRichPicker}
            />
            <Button type="submit" loading={busy}>Reply</Button>
          </div>
        </div>
      </form>
    </Card>
  )
}
