import { Card, EmptyState } from '../lib/vendor.js'
import { ModerationQueue } from '../components/ModerationQueue.jsx'
import { PageFrame } from './PageFrame.jsx'

export function ModerationPage({ user, router }) {
  const staff = ['moderator', 'admin', 'developer'].includes(user.role)

  return (
    <PageFrame
      eyebrow="STAFF / MODERATION"
      title="Moderation"
      description="Review safety reports, content removal, and appeals."
      hideHeader
    >
      {staff
        ? <ModerationQueue router={router} />
        : <Card><EmptyState status="error" title="Staff access required" description="This queue is for moderators and admins." /></Card>}
    </PageFrame>
  )
}
