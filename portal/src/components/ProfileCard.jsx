import { computed, signal } from '../lib/vendor.js'
import { Button, Card, Label } from '../lib/vendor.js'
import { ProfileEditor } from './ProfileEditor.jsx'
import { UserBadges } from './UserBadges.jsx'
import { formatMonthYear } from '../lib/dates.js'
import { mediaSrc } from '../lib/media.js'
import { UserAvatar } from './UserAvatar.jsx'

export function ProfileCard({ user, onLogout, onUpdated }) {
  const profileUser = signal(user)
  const editing = signal(false)

  const profileContent = computed(() => {
    const currentUser = profileUser.value
    const profile = currentUser.profile || {}

    return editing.value
      ? <ProfileEditor
        user={currentUser}
        onSaved={updatedUser => {
          profileUser.value = updatedUser
          editing.value = false
          onUpdated(updatedUser)
        }}
        onCancel={() => editing.value = false}
      />
      : <>
        <div class="profile-card-media">
          {profile.bannerUrl && <img class="profile-banner" src={mediaSrc(profile.bannerUrl)} alt="" loading="lazy" decoding="async" />}
          <UserAvatar user={currentUser} size="large" className="profile-avatar" />
        </div>
        <div class="profile-copy">
          <Label size="large">{profile.displayName || currentUser.username}</Label>
          <UserBadges badges={currentUser.badges} />
          <span class="profile-handle">@{currentUser.username}</span>
          <p>{profile.bio || 'No bio yet.'}</p>
          <span class="profile-joined">Joined {formatMonthYear(currentUser.createdAt)}</span>
        </div>
        <div class="profile-actions">
          <Button variant="tertiary" onClick={() => editing.value = true}>Edit profile</Button>
          <Button variant="tertiary" onClick={onLogout}>Log out</Button>
        </div>
      </>
  })

  return (
    <Card class="profile-card">
      {profileContent}
    </Card>
  )
}
