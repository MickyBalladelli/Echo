import { computed } from '../lib/vendor.js'
import { NotificationPeek } from './NotificationPeek.jsx'
import { PostOverview } from './PostOverview.jsx'

export function ContextRail({ router, unreadCount, notificationVersion }) {
  const isTimeline = computed(() => router?.path?.value === '/' || router?.path?.value === '/following')

  return (
    <aside class={computed(() => isTimeline.value ? 'context-rail context-rail-timeline' : 'context-rail')} aria-label="Echo context panel">
      {computed(() => isTimeline.value
        ? <NotificationPeek router={router} unreadCount={unreadCount} notificationVersion={notificationVersion} />
        : null)}
      <PostOverview router={router} />
    </aside>
  )
}
