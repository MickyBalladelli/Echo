import { computed, signal } from '../lib/vendor.js'
import { Button } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function FollowButton({ userId, following, onChanged }) {
  const active = signal(following)
  const busy = signal(false)
  const error = signal('')
  const label = computed(() => active.value ? 'Following' : 'Follow')

  async function toggleFollow() {
    if (busy.value) return
    busy.value = true
    error.value = ''

    try {
      const result = await apiRequest(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method: active.value ? 'DELETE' : 'PUT'
      })
      active.value = result.data.follow.following
      onChanged?.(result.data.follow)
    } catch (requestError) {
      error.value = requestError.message || 'Could not update follow'
    } finally {
      busy.value = false
    }
  }

  return (
    <div class="follow-control">
      <Button
        variant={computed(() => active.value ? 'secondary' : 'primary')}
        size="small"
        pressed={active}
        loading={busy}
        ariaLabel={computed(() => active.value ? 'Unfollow this user' : 'Follow this user')}
        onClick={toggleFollow}
      >
        {label}
      </Button>
      <span class="follow-control-error" role="alert">{error}</span>
    </div>
  )
}
