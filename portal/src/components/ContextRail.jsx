import { Badge, Card, Label, Separator } from '../lib/vendor.js'

export function ContextRail({ user, apiStatus, socketStatus }) {
  return (
    <aside class="context-rail" aria-label="Echo context panel">
      <Card class="context-card">
        <Label size="small" tone="accent">YOUR SIGNAL</Label>
        <div class="context-user">
          <div class="profile-avatar context-avatar" aria-hidden="true">
            {(user.profile?.displayName || user.username).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{user.profile?.displayName || user.username}</strong>
            <span>@{user.username}</span>
          </div>
        </div>
        <Separator />
        <div class="context-status-row"><span>API</span><Badge>{apiStatus}</Badge></div>
        <div class="context-status-row"><span>Socket</span><Badge>{socketStatus}</Badge></div>
      </Card>
      <Card class="context-card">
        <Label size="small" tone="accent">WHAT IS NEXT</Label>
        <h2>Make some noise.</h2>
        <p>Post, reply, follow, and find a channel when those tools land.</p>
      </Card>
    </aside>
  )
}
