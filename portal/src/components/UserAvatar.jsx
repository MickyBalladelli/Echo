import { Avatar } from '../lib/vendor.js'

export function UserAvatar({ user, size = 'medium', className = '', status }) {
  const name = user?.profile?.displayName || user?.displayName || user?.username || 'User'
  const src = user?.profile?.avatarUrl || user?.avatarUrl || undefined

  return <Avatar name={name} src={src} size={size} class={className} status={status} showStatus={Boolean(status)} />
}
