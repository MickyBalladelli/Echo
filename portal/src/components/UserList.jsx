import { Card, EmptyState, Label } from '../lib/vendor.js'
import { KeyboardList } from './KeyboardList.jsx'
import { UserAvatar } from './UserAvatar.jsx'
import { UserProfilePopover } from './UserProfilePopover.jsx'

export function UserList({ title, users, router }) {
  return (
    <Card class="social-list-card">
      <Label size="small" tone="accent">{title.toUpperCase()}</Label>
      {users.length === 0
        ? <EmptyState title={`No ${title.toLowerCase()} yet`} />
        : <KeyboardList label={`${title} list`} className="social-user-list">
          {users.map(user => (
            <UserProfilePopover
              key={user.id}
              username={user.username}
              previewUser={user}
              router={router}
              wrapperClassName="social-user-popover-anchor-wide"
              triggerClassName="social-user-row"
              triggerProps={{ 'data-keyboard-item': 'true' }}
            >
              <UserAvatar user={user} size="small" className="social-user-avatar" />
              <span>
                <strong>{user.profile.displayName}</strong>
                <small>@{user.username}</small>
                {user.mutual && <small class="social-user-mutual">Mutual follow</small>}
                {!user.mutual && user.mutualCount > 0 && <small class="social-user-mutual">{user.mutualCount} mutual follows</small>}
              </span>
            </UserProfilePopover>
          ))}
        </KeyboardList>}
    </Card>
  )
}
