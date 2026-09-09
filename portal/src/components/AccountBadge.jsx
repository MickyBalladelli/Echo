const accountBadgeLabels = Object.freeze({
  verified: 'Verified account',
  government: 'Official government account',
  business: 'Business account'
})

export function AccountBadge({ type, compact = false }) {
  const label = accountBadgeLabels[type]
  if (!label) return null

  return (
    <span
      class={`account-badge account-badge-${type} ${compact ? 'account-badge-compact' : ''}`}
      role="img"
      aria-label={label}
      title={label}
    >✓</span>
  )
}
