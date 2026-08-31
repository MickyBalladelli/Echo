import { computed, html } from '../lib/vendor.js'
import { Navigator } from '../lib/vendor.js'

const navItems = Object.freeze([
  { path: '/', label: 'Home', mark: '⌂' },
  { path: '/following', label: 'Following', mark: '◇' },
  { path: '/explore', label: 'Explore', mark: '⌕' },
  { path: '/notifications', label: 'Notifications', mark: '●' },
  { path: '/bookmarks', label: 'Bookmarks', mark: '▱' },
  { path: '/notes', label: 'Notes', mark: '▤' },
  { path: '/channels', label: 'Channels', mark: '◈' },
  { path: '/chat', label: 'Chat', mark: '◌' },
  { path: '/profile', label: 'Profile', mark: '◎' },
  { path: '/preferences', label: 'Preferences', mark: '⚙' }
])

function NavigationLink({ item, router, unreadNotifications }) {
  const active = computed(() => router.path.value === item.path)
  const className = computed(() => active.value ? 'shell-nav-link shell-nav-link-active' : 'shell-nav-link')
  const ariaCurrent = computed(() => active.value ? 'page' : undefined)
  const unreadBadge = item.path === '/notifications'
    ? computed(() => unreadNotifications.value > 0
      ? html`<span class="shell-nav-count" aria-label="${unreadNotifications.value} unread">${unreadNotifications.value > 99 ? '99+' : unreadNotifications.value}</span>`
      : null)
    : null

  return html`
    <a
      class="${className}"
      href="${item.path}"
      aria-current="${ariaCurrent}"
      @click=${router.link(item.path)}
    >
      <span class="shell-nav-mark" aria-hidden="true">${item.mark}</span>
      <span>${item.label}</span>
      ${unreadBadge}
    </a>
  `
}

export function ShellNavigation({ router, user, unreadNotifications }) {
  const visibleItems = user.role === 'moderator' || user.role === 'admin'
    ? [...navItems, { path: '/moderation', label: 'Moderation', mark: '⚑' }]
    : navItems
  const links = visibleItems.map(item => NavigationLink({ item, router, unreadNotifications }))

  return Navigator({
    ariaLabel: 'Echo primary navigation',
    title: 'Echo',
    description: `@${user.username}`,
    class: 'shell-navigator',
    children: html`<div class="shell-nav-links">${links}</div>`
  })
}
