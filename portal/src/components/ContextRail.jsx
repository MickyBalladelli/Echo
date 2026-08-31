import { computed } from '../lib/vendor.js'
import { Badge, Card, Label, Separator } from '../lib/vendor.js'
import { UserAvatar } from './UserAvatar.jsx'

export function ContextRail({ user, apiStatus, socketStatus }) {
  const socketTone = computed(() => socketStatus.value === 'connected'
    ? 'success'
    : socketStatus.value === 'reconnecting' || socketStatus.value === 'syncing'
      ? 'warning'
      : 'error')

  return (
    <aside class="context-rail" aria-label="Echo context panel">
      <Card class="context-card">
        <Label size="small" tone="accent">YOUR SIGNAL</Label>
        <div class="context-user">
          <UserAvatar user={user} size="medium" className="profile-avatar context-avatar" />
          <div>
            <strong>{user.profile?.displayName || user.username}</strong>
            <span>@{user.username}</span>
          </div>
        </div>
        <Separator />
        <div class="context-status-row"><span>API</span><Badge>{apiStatus}</Badge></div>
        <div class="context-status-row" aria-live="polite"><span>Socket</span><Badge tone={socketTone}>{socketStatus}</Badge></div>
      </Card>
      <Card class="context-card">
        <Label size="small" tone="accent">WHAT IS NEXT</Label>
        <h2>Make some noise.</h2>
        <p>Post, reply, follow, and find a channel when those tools land.</p>
      </Card>
    </aside>
  )
}
