import { computed, DropdownMenu } from '../lib/vendor.js'
import { UserAvatar } from './UserAvatar.jsx'

export function AccountMenu({ user, router, onLogout }) {
  const displayName = user.profile?.displayName || user.username
  const goTo = path => () => router.navigate(path)

  const items = [
    { id: 'profile', label: 'Profile', icon: '◎', onSelect: goTo('/profile') },
    { id: 'settings', label: 'Settings', icon: '⚙', onSelect: goTo('/preferences') },
    ...(user.role === 'moderator' || user.role === 'admin'
      ? [{ id: 'moderation', label: 'Moderation', icon: '⚑', onSelect: goTo('/moderation') }]
      : []),
    { type: 'separator' },
    { id: 'logout', label: 'Log out', icon: '↪', onSelect: onLogout }
  ]

  return DropdownMenu({
    class: 'echo-account-menu',
    ariaLabel: 'Account menu',
    placement: 'bottom-end',
    trigger: ({ open, toggle }) => (
      <button
        class="echo-account-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={computed(() => open.value ? 'true' : 'false')}
        aria-label={`Open account menu for @${user.username}`}
        title={`Account: @${user.username}`}
        onClick={toggle}
      >
        <UserAvatar user={user} size="small" className="echo-account-avatar" />
        <span class="echo-account-trigger-copy">
          <strong>{displayName}</strong>
          <span>@{user.username}</span>
        </span>
        <span class="echo-account-chevron" aria-hidden="true">⌄</span>
      </button>
    ),
    items
  })
}
