import { Badge } from '../lib/vendor.js'

const badgeLabels = Object.freeze({
  verified: '✓ Verified',
  government: 'Government',
  business: 'Business',
  staff: '★ Staff'
})

const compactBadgeLabels = Object.freeze({
  verified: '✓',
  government: 'Gov',
  business: 'Biz',
  staff: '★'
})

const badgeTones = Object.freeze({
  verified: 'info',
  government: 'neutral',
  business: 'warning',
  staff: 'accent'
})

export function UserBadges({ badges = [], compact = false }) {
  if (!badges.length) return null

  return (
    <span class="user-badges" aria-label="Account badges">
      {badges.map(type => (
        <Badge key={type} tone={badgeTones[type] || 'neutral'}>{compact ? compactBadgeLabels[type] || type : badgeLabels[type] || type}</Badge>
      ))}
    </span>
  )
}
