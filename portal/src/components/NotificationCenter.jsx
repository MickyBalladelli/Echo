import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function notificationText(notification) {
  const actor = notification.actor?.displayName || 'Someone'
  const more = notification.groupCount > 1 ? ` and ${notification.groupCount - 1} more` : ''
  const messages = {
    reply: `${actor}${more} replied to your post`,
    like: `${actor}${more} liked your post`,
    follow: `${actor}${more} followed you`,
    channel_invite: `${actor}${more} invited you to a channel`,
    channel_join: `${actor}${more} joined your channel`,
    channel_post: `${actor}${more} posted in your channel`,
    chat_message: `${actor}${more} sent you a message`
  }
  return messages[notification.type] || `${actor} sent a notification`
}

function actorInitial(notification) {
  return (notification.actor?.displayName || '?').slice(0, 1).toUpperCase()
}

export function NotificationCenter({ router, unreadCount, notificationVersion }) {
  const notifications = signal([])
  const nextCursor = signal(null)
  const state = signal('loading')
  const error = signal('')
  const loadingMore = signal(false)
  const markingAll = signal(false)

  async function load({ append = false } = {}) {
    if (append) loadingMore.value = true
    else state.value = 'loading'
    error.value = ''

    try {
      const parameters = new URLSearchParams({ limit: '20' })
      if (append && nextCursor.value) parameters.set('cursor', nextCursor.value)
      const result = await apiRequest(`/api/notifications?${parameters.toString()}`)
      notifications.value = append ? [...notifications.value, ...result.data] : result.data
      nextCursor.value = result.meta?.nextCursor || null
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load notifications'
      state.value = 'error'
    } finally {
      loadingMore.value = false
    }
  }

  async function openNotification(event, notification) {
    event.preventDefault()
    if (!notification.readAt) {
      try {
        const result = await apiRequest(`/api/notifications/groups/${encodeURIComponent(notification.groupKey)}/read`, {
          method: 'PUT'
        })
        notifications.value = notifications.value.map(item => item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item)
        unreadCount.value = Math.max(0, unreadCount.value - (result.data.notification.updatedCount || 1))
      } catch (requestError) {
        error.value = requestError.message || 'Could not mark notification read'
      }
    }
    router.navigate(notification.href)
  }

  async function markAllRead() {
    if (markingAll.value || unreadCount.value === 0) return
    markingAll.value = true
    error.value = ''
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PUT' })
      const readAt = new Date().toISOString()
      notifications.value = notifications.value.map(notification => ({ ...notification, readAt: notification.readAt || readAt }))
      unreadCount.value = 0
    } catch (requestError) {
      error.value = requestError.message || 'Could not mark notifications read'
    } finally {
      markingAll.value = false
    }
  }

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading notifications…</div></Card>
    if (state.value === 'error') {
      return (
        <Card>
          <EmptyState
            status="error"
            title="Notifications unavailable"
            description={error.value}
            action={Button({ children: 'Try again', onClick: () => load() })}
          />
        </Card>
      )
    }
    if (!notifications.value.length) {
      return <Card><EmptyState title="All quiet" description="New replies, likes, follows, channel events, and messages appear here." /></Card>
    }
    return (
      <div class="notification-list">
        {notifications.value.map(notification => (
          <a
            key={notification.id}
            class={notification.readAt ? 'notification-card' : 'notification-card notification-card-unread'}
            href={notification.href}
            onClick={event => openNotification(event, notification)}
          >
            <span class="notification-avatar" aria-hidden="true">{actorInitial(notification)}</span>
            <span class="notification-copy">
              <strong>{notificationText(notification)}</strong>
              <time datetime={notification.createdAt}>{formatTime(notification.createdAt)}</time>
            </span>
            {!notification.readAt && <span class="notification-unread-dot" aria-label="Unread" />}
          </a>
        ))}
      </div>
    )
  })
  const pagination = computed(() => nextCursor.value
    ? <div class="feed-load-more"><Button variant="secondary" loading={loadingMore} onClick={() => load({ append: true })}>Load more</Button></div>
    : null)
  const inlineError = computed(() => error.value && state.value !== 'error'
    ? <div class="post-feed-error" role="alert">{error.value}</div>
    : null)

  onMount(() => {
    load()
    return notificationVersion.subscribe(() => load())
  })

  return (
    <div class="notifications-stack">
      <div class="notifications-toolbar">
        <Label size="small" tone="accent">{computed(() => `${unreadCount.value} UNREAD`)}</Label>
        <Button variant="secondary" size="small" loading={markingAll} disabled={computed(() => unreadCount.value === 0)} onClick={markAllRead}>
          Mark all read
        </Button>
      </div>
      {content}
      {pagination}
      {inlineError}
    </div>
  )
}
