import { onMount, signal } from '../lib/vendor.js'
import { Card, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { FollowButton } from './FollowButton.jsx'
import { UserAvatar } from './UserAvatar.jsx'

function avatar(user) {
  return <UserAvatar user={user} size="small" className="social-user-avatar" />
}

export function SuggestedUsers({ router }) {
  const users = signal([])
  const state = signal('loading')

  async function load() {
    try {
      const result = await apiRequest('/api/users/suggestions?limit=6')
      users.value = result.data.users
      state.value = 'ready'
    } catch {
      state.value = 'error'
    }
  }

  onMount(load)

  if (state.value === 'loading') return <Card><div role="status">Finding people…</div></Card>
  if (state.value === 'error' || !users.value.length) return null

  return (
    <Card class="suggested-users-card">
      <Label size="small" tone="accent">PEOPLE TO FOLLOW</Label>
      <div class="suggested-user-list">
        {users.value.map(user => (
          <div class="suggested-user-row" key={user.id}>
            <a href={`/users/${user.username}`} onClick={router.link(`/users/${user.username}`)}>{avatar(user)}</a>
            <a class="suggested-user-copy" href={`/users/${user.username}`} onClick={router.link(`/users/${user.username}`)}>
              <strong>{user.profile.displayName}</strong>
              <small>@{user.username}</small>
              {user.mutualCount > 0 && <small>{user.mutualCount} mutual {user.mutualCount === 1 ? 'follow' : 'follows'}</small>}
            </a>
            <FollowButton
              userId={user.id}
              following={false}
              onChanged={follow => {
                if (!follow.optimistic) users.value = users.value.filter(item => item.id !== user.id)
              }}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
