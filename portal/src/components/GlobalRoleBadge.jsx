import { Badge } from '../lib/vendor.js'

export function GlobalRoleBadge({ role }) {
  if (role !== 'developer') return null
  return <Badge tone="accent" size="small">Developer</Badge>
}
