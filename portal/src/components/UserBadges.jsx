import { Badge } from '../lib/vendor.js'
import { AccountBadge } from './AccountBadge.jsx'

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

const accountBadgeTypes = new Set(['verified', 'government', 'business'])

export function UserBadges({ badges = [], compact = false }) {
  if (!badges.length) return null

  return (
    <span class="user-badges" aria-label="Account badges">
      {badges.map(type => (
        accountBadgeTypes.has(type)
          ? <AccountBadge key={type} type={type} compact={compact} />
          : <Badge key={type} tone={badgeTones[type] || 'neutral'}>{compact ? compactBadgeLabels[type] || type : badgeLabels[type] || type}</Badge>
      ))}
    </span>
  )
}
