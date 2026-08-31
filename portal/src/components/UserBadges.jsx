import { Badge } from '../lib/vendor.js'

const badgeLabels = Object.freeze({
  verified: '✓ Verified',
  staff: '★ Staff'
})

export function UserBadges({ badges = [] }) {
  if (!badges.length) return null

  return (
    <span class="user-badges" aria-label="Account badges">
      {badges.map(type => (
        <Badge key={type} tone={type === 'staff' ? 'accent' : 'success'}>{badgeLabels[type] || type}</Badge>
      ))}
    </span>
  )
}
