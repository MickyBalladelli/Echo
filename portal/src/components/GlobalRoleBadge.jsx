import { Badge } from '../lib/vendor.js'

const roleLabels = Object.freeze({
  moderator: 'Moderator',
  admin: 'Admin',
  developer: 'Developer'
})

const roleTones = Object.freeze({
  moderator: 'success',
  admin: 'accent',
  developer: 'accent'
})

export function GlobalRoleBadge({ role }) {
  const label = roleLabels[role]
  if (!label) return null
  return <Badge tone={roleTones[role]} size="small">{label}</Badge>
}
