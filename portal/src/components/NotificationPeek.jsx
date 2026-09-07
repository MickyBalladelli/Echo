import { computed, Label, onMount, signal } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { formatRelativeTime } from '../lib/dates.js'
import { UserAvatar } from './UserAvatar.jsx'
import { UserProfilePopover } from './UserProfilePopover.jsx'

function notificationText(notification, router) {
  const actor = notification.actor?.username
    ? <UserProfilePopover embedded username={notification.actor.username} previewUser={notification.actor} router={router}>{notification.actor.displayName}</UserProfilePopover>
    : notification.actor?.displayName || 'Someone'
  const more = notification.groupCount > 1 ? ` and ${notification.groupCount - 1} more` : ''
  const messages = {
    reply: <>{actor}{more} replied to your post</>,
    like: <>{actor}{more} liked your post</>,
    follow: <>{actor}{more} followed you</>,
    channel_invite: <>{actor}{more} invited you to a channel</>,
    channel_join: <>{actor}{more} joined your channel</>,
    channel_post: <>{actor}{more} created activity in your channel</>,
    chat_message: <>{actor}{more} sent you a message</>,
    mention: <>{actor}{more} tagged you{notification.channelId ? ' in a channel' : ''}</>,
    moderation_report: <>{actor}{more} reported {notification.payload?.targetType || 'content'} for review</>
  }
  return messages[notification.type] || <>{actor}{more} sent a notification</>
}

export function NotificationPeek({ router, unreadCount, notificationVersion }) {
  const notifications = signal([])
  const state = signal('loading')

  async function load() {
    state.value = 'loading'
    try {
      const result = await apiRequest('/api/notifications?limit=6')
      notifications.value = result.data || []
      state.value = 'ready'
    } catch {
      state.value = 'error'
    }
  }

  async function openNotification(event, notification) {
    event.preventDefault()
    if (!notification.readAt) {
      const groupCount = notification.groupCount || 1
      notification.readAt = new Date().toISOString()
      notifications.value = [...notifications.value]
      unreadCount.value = Math.max(0, unreadCount.value - groupCount)
      try {
        await apiRequest(`/api/notifications/groups/${encodeURIComponent(notification.groupKey)}/read`, { method: 'PUT' })
        window.dispatchEvent(new CustomEvent('echo:notifications-changed'))
      } catch {
        unreadCount.value += groupCount
      }
    }
    router.navigate(notification.href)
  }

  const content = computed(() => {
    if (state.value === 'loading') return <div class="notification-peek-status" role="status">Loading notifications…</div>
    if (state.value === 'error') return <div class="notification-peek-status">Could not load notifications.</div>
    if (!notifications.value.length) return <div class="notification-peek-status">All quiet.</div>

    return notifications.value.map(notification => (
      <a
        key={notification.id}
        class={notification.readAt ? 'notification-peek-item' : 'notification-peek-item notification-peek-item-unread'}
        href={notification.href}
        onClick={event => openNotification(event, notification)}
      >
        <UserAvatar user={notification.actor} size="small" className="notification-peek-avatar" />
        <span class="notification-peek-copy">
          <strong>{notificationText(notification, router)}</strong>
          <time datetime={notification.createdAt}>{formatRelativeTime(notification.createdAt)}</time>
        </span>
        {!notification.readAt && <span class="notification-unread-dot" role="img" aria-label="Unread" />}
      </a>
    ))
  })

  onMount(() => {
    load()
    return notificationVersion?.subscribe(load)
  })

  return (
    <section class="context-card notification-peek-card" aria-labelledby="notification-peek-title">
      <div class="notification-peek-heading">
        <div>
          <Label size="small" tone="accent">INBOX</Label>
          <h2 id="notification-peek-title">Notifications</h2>
        </div>
        <span class="notification-peek-unread">{computed(() => `${unreadCount.value} unread`)}</span>
      </div>
      <div class="notification-peek-list">{content}</div>
      <a class="notification-peek-link" href="/notifications" onClick={router.link('/notifications')}>Open all notifications →</a>
    </section>
  )
}
