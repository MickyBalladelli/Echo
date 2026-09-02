import { Badge } from '../lib/vendor.js'

const badgeLabels = Object.freeze({
  verified: '✓ Verified',
  staff: '★ Staff'
})

const compactBadgeLabels = Object.freeze({
  verified: '✓',
  staff: '★'
})

export function UserBadges({ badges = [], compact = false }) {
  if (!badges.length) return null

  return (
    <span class="user-badges" aria-label="Account badges">
      {badges.map(type => (
        <Badge key={type} tone={type === 'staff' ? 'accent' : 'success'}>{compact ? compactBadgeLabels[type] || type : badgeLabels[type] || type}</Badge>
      ))}
    </span>
  )
}
