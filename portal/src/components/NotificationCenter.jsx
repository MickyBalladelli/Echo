import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { LiveRegion } from './LiveRegion.jsx'
import { formatRelativeTime } from '../lib/dates.js'
import { KeyboardList } from './KeyboardList.jsx'
import { UserAvatar } from './UserAvatar.jsx'

function notificationText(notification) {
  const actor = notification.actor?.displayName || 'Someone'
  const more = notification.groupCount > 1 ? ` and ${notification.groupCount - 1} more` : ''
  const messages = {
    reply: `${actor}${more} replied to your post`,
    like: `${actor}${more} liked your post`,
    follow: `${actor}${more} followed you`,
    channel_invite: `${actor}${more} invited you to a channel`,
    channel_join: `${actor}${more} joined your channel`,
    channel_post: `${actor}${more} created activity in your channel`,
    chat_message: `${actor}${more} sent you a message`,
    mention: `${actor}${more} tagged you${notification.channelId ? ' in a channel' : ''}`
  }
  return messages[notification.type] || `${actor} sent a notification`
}

export function NotificationCenter({ router, unreadCount, notificationVersion }) {
  const notifications = signal([])
  const nextCursor = signal(null)
  const state = signal('loading')
  const error = signal('')
  const loadingMore = signal(false)
  const markingAll = signal(false)
  const announcement = signal('')

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
      const previousNotifications = notifications.value
      const previousUnread = unreadCount.value
      const optimisticCount = notification.groupCount || 1
      const readAt = new Date().toISOString()
      notifications.value = notifications.value.map(item => item.groupKey === notification.groupKey
        ? { ...item, readAt }
        : item)
      unreadCount.value = Math.max(0, previousUnread - optimisticCount)
      announcement.value = 'Notification marked read'
      try {
        const result = await apiRequest(`/api/notifications/groups/${encodeURIComponent(notification.groupKey)}/read`, {
          method: 'PUT'
        })
        unreadCount.value = Math.max(0, previousUnread - (result.data.notification.updatedCount || optimisticCount))
      } catch (requestError) {
        notifications.value = previousNotifications
        unreadCount.value = previousUnread
        announcement.value = 'Mark read failed. Previous state restored.'
        error.value = requestError.message || 'Could not mark notification read'
      }
    }
    router.navigate(notification.href)
  }

  async function markAllRead() {
    if (markingAll.value || unreadCount.value === 0) return
    const previousNotifications = notifications.value
    const previousUnread = unreadCount.value
    markingAll.value = true
    error.value = ''
    const readAt = new Date().toISOString()
    notifications.value = notifications.value.map(notification => ({ ...notification, readAt: notification.readAt || readAt }))
    unreadCount.value = 0
    announcement.value = 'All notifications marked read'
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PUT' })
    } catch (requestError) {
      notifications.value = previousNotifications
      unreadCount.value = previousUnread
      announcement.value = 'Mark all read failed. Previous state restored.'
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
      <KeyboardList label="Notifications" className="notification-list">
        {notifications.value.map(notification => (
          <a
            key={notification.id}
            data-keyboard-item="true"
            class={notification.readAt ? 'notification-card' : 'notification-card notification-card-unread'}
            href={notification.href}
            onClick={event => openNotification(event, notification)}
          >
            <UserAvatar user={notification.actor} size="medium" className="notification-avatar" />
            <span class="notification-copy">
              <strong>{notificationText(notification)}</strong>
              <time datetime={notification.createdAt}>{formatRelativeTime(notification.createdAt)}</time>
            </span>
            {!notification.readAt && <span class="notification-unread-dot" role="img" aria-label="Unread" />}
          </a>
        ))}
      </KeyboardList>
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
      <LiveRegion message={announcement} />
    </div>
  )
}
