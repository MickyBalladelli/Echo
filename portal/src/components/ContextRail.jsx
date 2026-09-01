import { Card, Label } from '../lib/vendor.js'

export function ContextRail() {
  return (
    <aside class="context-rail" aria-label="Echo context panel">
      <Card class="context-card">
        <Label size="small" tone="accent">WHAT IS NEXT</Label>
        <h2>Make some noise.</h2>
        <p>Post, reply, follow, and find a channel when those tools land.</p>
      </Card>
    </aside>
  )
}
