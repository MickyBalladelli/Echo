import { computed, signal } from '../lib/vendor.js'
import { CheckIcon, IconButton, UserPlusIcon } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { LiveRegion } from './LiveRegion.jsx'

export function FollowButton({ userId, following, followerCount, onChanged }) {
  const active = signal(following)
  const busy = signal(false)
  const error = signal('')
  const announcement = signal('')
  const label = computed(() => active.value ? 'Following' : 'Follow')
  const icon = computed(() => active.value ? CheckIcon({ size: '1.2em' }) : UserPlusIcon({ size: '1.2em' }))

  async function toggleFollow() {
    if (busy.value) return
    const previous = active.value
    const next = !previous
    const previousCount = followerCount
    busy.value = true
    error.value = ''
    active.value = next
    announcement.value = next ? 'Followed user' : 'Unfollowed user'
    onChanged?.({
      following: next,
      followerCount: Math.max(0, (followerCount || 0) + (next ? 1 : -1)),
      optimistic: true
    })

    try {
      const result = await apiRequest(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method: next ? 'PUT' : 'DELETE'
      })
      active.value = result.data.follow.following
      onChanged?.(result.data.follow)
    } catch (requestError) {
      active.value = previous
      announcement.value = 'Follow change failed. Previous state restored.'
      onChanged?.({ following: previous, followerCount: previousCount, optimistic: true })
      error.value = requestError.message || 'Could not update follow'
    } finally {
      busy.value = false
    }
  }

  return (
    <div class="follow-control">
      <IconButton
        class="profile-follow-icon"
        icon={icon}
        size="small"
        pressed={active}
        loading={busy}
        title={label}
        ariaLabel={computed(() => active.value ? 'Unfollow this user' : 'Follow this user')}
        onClick={toggleFollow}
      />
      <span class="follow-control-error" role="alert">{error}</span>
      <LiveRegion message={announcement} />
    </div>
  )
}
