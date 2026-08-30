import { computed, signal } from '../lib/vendor.js'
import { Button, Card, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

const maxPostLength = 280

export function PostComposer({ onCreated, channelId = null }) {
  const body = signal('')
  const busy = signal(false)
  const error = signal('')
  const remaining = computed(() => maxPostLength - body.value.length)

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
        body: JSON.stringify({ body: trimmedBody, ...(channelId ? { channelId } : {}) })
      })
      body.value = ''
      onCreated(result.data.post)
    } catch (requestError) {
      error.value = requestError.message || 'Could not publish post'
    } finally {
      busy.value = false
    }
  }

  return (
    <Card class="post-composer">
      <div class="post-composer-heading">
        <div>
          <Label size="small" tone="accent">{channelId ? 'WRITE / CHANNEL POST' : 'WRITE / POST'}</Label>
          <h2>{channelId ? 'Post to channel' : 'Send a signal'}</h2>
        </div>
        <span class={computed(() => remaining.value < 40 ? 'post-character-count post-character-count-warning' : 'post-character-count')}>
          {remaining} left
        </span>
      </div>
      <form onSubmit={submit}>
        <textarea
          class="post-composer-input"
          use:bind={body}
          maxlength={maxPostLength}
          rows="4"
          placeholder="What is happening?"
          aria-label="Post text"
        />
        <div class="post-composer-footer">
          <div class="post-composer-error" role="alert" aria-live="polite">{error}</div>
          <Button type="submit" loading={busy}>Post</Button>
        </div>
      </form>
    </Card>
  )
}
