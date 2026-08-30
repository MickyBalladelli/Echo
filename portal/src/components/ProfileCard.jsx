import { computed, signal } from '../lib/vendor.js'
import { Button, Card, Label } from '../lib/vendor.js'
import { ProfileEditor } from './ProfileEditor.jsx'

function formatJoinDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric'
  }).format(date)
}

export function ProfileCard({ user, onLogout, onUpdated }) {
  const profile = user.profile || {}
  const initials = (profile.displayName || user.username).slice(0, 1).toUpperCase()
  const editing = signal(false)

  const profileContent = computed(() => editing.value
    ? <ProfileEditor
      user={user}
      onSaved={updatedUser => {
        editing.value = false
        onUpdated(updatedUser)
      }}
      onCancel={() => editing.value = false}
    />
    : <>
      <div class="profile-avatar" aria-hidden="true">{initials}</div>
      <div class="profile-copy">
        <Label size="large">{profile.displayName || user.username}</Label>
        <span class="profile-handle">@{user.username}</span>
        <p>{profile.bio || 'No bio yet.'}</p>
        <span class="profile-joined">Joined {formatJoinDate(user.createdAt)}</span>
      </div>
      <div class="profile-actions">
        <Button variant="tertiary" onClick={() => editing.value = true}>Edit profile</Button>
        <Button variant="tertiary" onClick={onLogout}>Log out</Button>
      </div>
    </>)

  return (
    <Card class="profile-card">
      {profileContent}
    </Card>
  )
}
