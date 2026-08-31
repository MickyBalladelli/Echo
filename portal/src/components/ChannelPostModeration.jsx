import { computed, signal } from '../lib/vendor.js'
import { Button } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function ChannelPostModeration({ slug, post, canPin, pinned, onChanged, onPinned }) {
  const busy = signal('')
  const error = signal('')

  async function moderate(status) {
    busy.value = status
    error.value = ''
    try {
      const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/posts/${encodeURIComponent(post.id)}/moderation`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      onChanged?.(result.data.post)
    } catch (requestError) {
      error.value = requestError.message || 'Could not moderate post'
    } finally {
      busy.value = ''
    }
  }

  async function togglePin() {
    busy.value = 'pin'
    error.value = ''
    try {
      const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/pinned-post`, {
        method: 'PATCH',
        body: JSON.stringify({ postId: pinned ? null : post.id })
      })
      onPinned?.(result.data.channel)
    } catch (requestError) {
      error.value = requestError.message || 'Could not update pinned post'
    } finally {
      busy.value = ''
    }
  }

  return (
    <div class="channel-post-moderation">
      {post.moderationStatus !== 'approved' && <>
        <Button size="small" variant="secondary" loading={computed(() => busy.value === 'approved')} onClick={() => moderate('approved')}>Approve</Button>
        <Button size="small" variant="tertiary" loading={computed(() => busy.value === 'rejected')} onClick={() => moderate('rejected')}>Reject</Button>
      </>}
      {canPin && post.moderationStatus === 'approved' && <Button size="small" variant="tertiary" loading={computed(() => busy.value === 'pin')} onClick={togglePin}>{pinned ? 'Unpin' : 'Pin'}</Button>}
      <span class="channel-post-moderation-error" role="alert">{error}</span>
    </div>
  )
}
