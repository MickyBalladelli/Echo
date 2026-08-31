import { computed, signal } from '../lib/vendor.js'
import { Button, Card, Label } from '../lib/vendor.js'
import { ProfileEditor } from './ProfileEditor.jsx'
import { UserBadges } from './UserBadges.jsx'
import { formatMonthYear } from '../lib/dates.js'
import { UserAvatar } from './UserAvatar.jsx'

export function ProfileCard({ user, onLogout, onUpdated }) {
  const profile = user.profile || {}
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
      <div class="profile-card-media">
        {profile.bannerUrl && <img class="profile-banner" src={profile.bannerUrl} alt="" loading="lazy" decoding="async" />}
        <UserAvatar user={user} size="large" className="profile-avatar" />
      </div>
      <div class="profile-copy">
        <Label size="large">{profile.displayName || user.username}</Label>
        <UserBadges badges={user.badges} />
        <span class="profile-handle">@{user.username}</span>
        <p>{profile.bio || 'No bio yet.'}</p>
        <span class="profile-joined">Joined {formatMonthYear(user.createdAt)}</span>
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
