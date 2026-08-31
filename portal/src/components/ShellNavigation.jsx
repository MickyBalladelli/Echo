import { computed, html, onMount, signal } from '../lib/vendor.js'
import { Navigator, TreeView } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

const navItems = Object.freeze([
  {
    id: 'timeline',
    label: 'Timeline',
    mark: '⌁',
    children: [
      { path: '/', label: 'For you', mark: '⌂' },
      { path: '/following', label: 'Following', mark: '◇' }
    ]
  },
  { path: '/explore', label: 'Explore', mark: '⌕' },
  { path: '/notifications', label: 'Notifications', mark: '●' },
  { path: '/bookmarks', label: 'Bookmarks', mark: '▱' },
  { path: '/notes', label: 'Notes', mark: '▤' },
  { path: '/channels', label: 'Channels', mark: '◈' },
  { path: '/chat', label: 'Chat', mark: '◌' },
  { path: '/profile', label: 'Profile', mark: '◎' },
  { path: '/preferences', label: 'Preferences', mark: '⚙' }
])

function isChannelsPath(path) {
  return path === '/channels' || path.startsWith('/channels/')
}

function isTimelinePath(path) {
  return path === '/' || path === '/following'
}

function renderTreeItem(item) {
  return html`
    <span class="shell-tree-item">
      ${item.mark ? html`<span class="shell-tree-mark" aria-hidden="true">${item.mark}</span>` : null}
      <span>${item.label}</span>
    </span>
  `
}

export function ShellNavigation({ router, user, unreadNotifications }) {
  const channels = signal([])
  const channelState = signal('loading')
  const visibleItems = user.role === 'moderator' || user.role === 'admin'
    ? [...navItems, { path: '/moderation', label: 'Moderation', mark: '⚑' }]
    : navItems

  onMount(() => {
    let active = true
    const loadChannels = async () => {
      channelState.value = 'loading'
      try {
        const result = await apiRequest('/api/channels?limit=100')
        if (!active) return
        channels.value = result.data.filter(channel => channel.isOwner || channel.membershipRole)
        channelState.value = 'ready'
      } catch {
        if (active) channelState.value = 'error'
      }
    }
    const refreshChannels = () => loadChannels()

    window.addEventListener('echo:channels-changed', refreshChannels)
    loadChannels()

    return () => {
      active = false
      window.removeEventListener('echo:channels-changed', refreshChannels)
    }
  })

  const treeItems = computed(() => {
    const channelChildren = channels.value.length > 0
      ? channels.value.map(channel => ({
        id: `channel-${channel.id}`,
        label: channel.name,
        href: `/channels/${channel.slug}`,
        active: router.path.value === `/channels/${channel.slug}`,
        meta: channel.isOwner ? 'owner' : 'joined',
        onClick: router.link(`/channels/${channel.slug}`)
      }))
      : [{
        id: 'channels-empty',
        label: channelState.value === 'loading' ? 'Loading channels…' : channelState.value === 'error' ? 'Channels unavailable' : 'No channels yet'
      }]

    const renderLeaf = item => ({
      ...item,
      id: item.path,
      href: item.path,
      active: router.path.value === item.path,
      onClick: router.link(item.path),
      meta: item.path === '/notifications' && unreadNotifications.value > 0
        ? unreadNotifications.value
        : undefined
    })

    return visibleItems.map(item => {
      if (item.children) {
        return {
          ...item,
          hasChildren: true,
          expanded: true,
          active: isTimelinePath(router.path.value),
          children: item.children.map(renderLeaf)
        }
      }

      const active = item.path === '/channels'
        ? isChannelsPath(router.path.value)
        : router.path.value === item.path

      if (item.path === '/channels') {
        return {
          ...item,
          id: 'channels',
          hasChildren: true,
          expanded: true,
          active,
          children: channelChildren,
          onClick: () => {
            if (router.path.value !== '/channels') router.navigate('/channels')
          }
        }
      }

      return renderLeaf({ ...item, active })
    })
  })

  return Navigator({
    ariaLabel: 'Echo primary navigation',
    title: 'Echo',
    description: `@${user.username}`,
    class: 'shell-navigator',
    children: TreeView({
      id: 'echo-navigation-tree',
      ariaLabel: 'Echo primary navigation tree',
      items: treeItems,
      model: 'nocturne',
      itemVariant: 'minimal',
      onRender: renderTreeItem
    })
  })
}
