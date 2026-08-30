import { computed, html } from '../lib/vendor.js'
import { Navigator } from '../lib/vendor.js'

const navItems = Object.freeze([
  { path: '/', label: 'Home', mark: '⌂' },
  { path: '/following', label: 'Following', mark: '◇' },
  { path: '/explore', label: 'Explore', mark: '⌕' },
  { path: '/notifications', label: 'Notifications', mark: '●' },
  { path: '/notes', label: 'Notes', mark: '▤' },
  { path: '/channels', label: 'Channels', mark: '◈' },
  { path: '/chat', label: 'Chat', mark: '◌' },
  { path: '/profile', label: 'Profile', mark: '◎' }
])

function NavigationLink({ item, router }) {
  const active = computed(() => router.path.value === item.path)
  const className = computed(() => active.value ? 'shell-nav-link shell-nav-link-active' : 'shell-nav-link')
  const ariaCurrent = computed(() => active.value ? 'page' : undefined)

  return html`
    <a
      class="${className}"
      href="${item.path}"
      aria-current="${ariaCurrent}"
      @click=${router.link(item.path)}
    >
      <span class="shell-nav-mark" aria-hidden="true">${item.mark}</span>
      <span>${item.label}</span>
    </a>
  `
}

export function ShellNavigation({ router, user }) {
  const links = navItems.map(item => NavigationLink({ item, router }))

  return Navigator({
    ariaLabel: 'Echo primary navigation',
    title: 'Echo',
    description: `@${user.username}`,
    class: 'shell-navigator',
    children: html`<div class="shell-nav-links">${links}</div>`
  })
}
