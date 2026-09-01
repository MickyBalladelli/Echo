import { computed, html, onMount, signal } from '../lib/vendor.js'
import { GroupIcon, Navigator, TreeView } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

const navItems = Object.freeze([
  {
    id: 'timeline',
    label: 'Timeline',
    mark: '⌁',
    children: [
      { path: '/', label: 'For you', mark: '⌂' },
      { path: '/following', label: 'Following', mark: GroupIcon({ size: 17 }) }
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
  const markClass = item.path === '/following'
    ? 'shell-tree-mark shell-tree-mark-following'
    : 'shell-tree-mark'

  return html`
    <span class="shell-tree-item">
      ${item.mark ? html`<span class="${markClass}" aria-hidden="true">${item.mark}</span>` : null}
      <span>${item.label}</span>
    </span>
  `
}

export function ShellNavigation({ router, user, unreadNotifications, notificationVersion }) {
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
        const [result, notificationResult] = await Promise.all([
          apiRequest('/api/channels?limit=100'),
          apiRequest('/api/notifications/channel-unread-counts')
        ])
        if (!active) return
        const unreadByChannel = new Map((notificationResult.data || []).map(item => [item.channelId, item.unreadCount]))
        channels.value = result.data
          .filter(channel => channel.isOwner || channel.membershipRole)
          .map(channel => ({ ...channel, unreadNotificationCount: unreadByChannel.get(channel.id) || 0 }))
        channelState.value = 'ready'
      } catch {
        if (active) channelState.value = 'error'
      }
    }
    const refreshChannels = () => loadChannels()
    const refreshNotificationCounts = async () => {
      try {
        const result = await apiRequest('/api/notifications/channel-unread-counts')
        if (!active) return
        const unreadByChannel = new Map((result.data || []).map(item => [item.channelId, item.unreadCount]))
        channels.value = channels.value.map(channel => ({
          ...channel,
          unreadNotificationCount: unreadByChannel.get(channel.id) || 0
        }))
      } catch {}
    }

    window.addEventListener('echo:channels-changed', refreshChannels)
    window.addEventListener('echo:notifications-changed', refreshNotificationCounts)
    const stopNotificationVersion = notificationVersion?.subscribe(refreshNotificationCounts)
    loadChannels()

    return () => {
      active = false
      window.removeEventListener('echo:channels-changed', refreshChannels)
      window.removeEventListener('echo:notifications-changed', refreshNotificationCounts)
      stopNotificationVersion?.()
    }
  })

  const treeItems = computed(() => {
    const unreadChannelCount = channels.value.reduce((total, channel) => total + channel.unreadNotificationCount, 0)
    const channelChildren = channels.value.length > 0
      ? channels.value.map(channel => ({
        id: `channel-${channel.id}`,
        label: channel.name,
        href: `/channels/${channel.slug}`,
        active: router.path.value === `/channels/${channel.slug}`,
        meta: channel.unreadNotificationCount > 0
          ? channel.unreadNotificationCount
          : channel.isOwner ? 'owner' : 'joined',
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
          meta: unreadChannelCount > 0 ? unreadChannelCount : undefined,
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
    sticky: true,
    stickyTop: '3.7rem',
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
