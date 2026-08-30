import { computed, signal } from '../lib/vendor.js'
import { Button, Card, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function ReplyComposer({ replyTarget, onCreated, onCancel }) {
  const body = signal('')
  const busy = signal(false)
  const error = signal('')
  const targetName = computed(() => replyTarget.value?.author?.displayName || 'this thread')
  const targetDepth = computed(() => replyTarget.value?.depth || 0)
  const targetLabel = computed(() => `Reply to ${targetName.value}`)
  const cancelButton = computed(() => targetDepth.value > 0
    ? <Button type="button" variant="tertiary" size="small" onClick={cancel}>Reply to post</Button>
    : null)

  async function submit(event) {
    event.preventDefault()
    const target = replyTarget.value
    const trimmedBody = body.value.trim()

    if (!target) {
      error.value = 'Choose a post to reply to.'
      return
    }

    if (!trimmedBody) {
      error.value = 'Write a reply first.'
      return
    }

    error.value = ''
    busy.value = true

    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(target.id)}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmedBody })
      })
      body.value = ''
      onCreated(result.data.reply)
    } catch (requestError) {
      error.value = requestError.message || 'Could not publish reply'
    } finally {
      busy.value = false
    }
  }

  function cancel() {
    body.value = ''
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
        />
        <div class="post-composer-footer">
          <div class="post-composer-error" role="alert" aria-live="polite">{error}</div>
          <Button type="submit" loading={busy}>Reply</Button>
        </div>
      </form>
    </Card>
  )
}
