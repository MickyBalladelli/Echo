import { Card, EmptyState } from '../lib/vendor.js'
import { ModerationQueue } from '../components/ModerationQueue.jsx'
import { PageFrame } from './PageFrame.jsx'

export function ModerationPage({ user }) {
  const staff = user.role === 'moderator' || user.role === 'admin'

  return (
    <PageFrame
      eyebrow="STAFF / MODERATION"
      title="Moderation"
      description="Review safety reports, content removal, and appeals."
    >
      {staff
        ? <ModerationQueue />
        : <Card><EmptyState status="error" title="Staff access required" description="This queue is for moderators and admins." /></Card>}
    </PageFrame>
  )
}
