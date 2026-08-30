import { Card, EmptyState, Label } from '../lib/vendor.js'

function initial(user) {
  return (user.profile.displayName || user.username).slice(0, 1).toUpperCase()
}

export function UserList({ title, users, router }) {
  return (
    <Card class="social-list-card">
      <Label size="small" tone="accent">{title.toUpperCase()}</Label>
      {users.length === 0
        ? <EmptyState title={`No ${title.toLowerCase()} yet`} />
        : <div class="social-user-list">
          {users.map(user => (
            <a
              key={user.id}
              class="social-user-row"
              href={`/users/${user.username}`}
              onClick={router.link(`/users/${user.username}`)}
            >
              <span class="social-user-avatar" aria-hidden="true">{initial(user)}</span>
              <span>
                <strong>{user.profile.displayName}</strong>
                <small>@{user.username}</small>
              </span>
            </a>
          ))}
        </div>}
    </Card>
  )
}
