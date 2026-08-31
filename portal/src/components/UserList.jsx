import { Card, EmptyState, Label } from '../lib/vendor.js'
import { KeyboardList } from './KeyboardList.jsx'
import { UserAvatar } from './UserAvatar.jsx'

export function UserList({ title, users, router }) {
  return (
    <Card class="social-list-card">
      <Label size="small" tone="accent">{title.toUpperCase()}</Label>
      {users.length === 0
        ? <EmptyState title={`No ${title.toLowerCase()} yet`} />
        : <KeyboardList label={`${title} list`} className="social-user-list">
          {users.map(user => (
            <a
              key={user.id}
              data-keyboard-item="true"
              class="social-user-row"
              href={`/users/${user.username}`}
              onClick={router.link(`/users/${user.username}`)}
            >
              <UserAvatar user={user} size="small" className="social-user-avatar" />
              <span>
                <strong>{user.profile.displayName}</strong>
                <small>@{user.username}</small>
                {user.mutual && <small class="social-user-mutual">Mutual follow</small>}
                {!user.mutual && user.mutualCount > 0 && <small class="social-user-mutual">{user.mutualCount} mutual follows</small>}
              </span>
            </a>
          ))}
        </KeyboardList>}
    </Card>
  )
}
