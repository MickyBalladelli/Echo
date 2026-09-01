import { Avatar } from '../lib/vendor.js'
import { mediaSrc } from '../lib/media.js'

export function UserAvatar({ user, size = 'medium', className = '', status }) {
  const name = user?.profile?.displayName || user?.displayName || user?.username || 'User'
  const src = mediaSrc(user?.profile?.avatarUrl || user?.avatarUrl)

  return <Avatar name={name} src={src} size={size} class={className} status={status} showStatus={Boolean(status)} />
}
