import { computed, signal } from '../lib/vendor.js'
import { Button, Card } from '../lib/vendor.js'
import { ProfileEditor } from './ProfileEditor.jsx'
import { ProfileHero } from './ProfileHero.jsx'

export function ProfileCard({ user, onUpdated }) {
  const profileUser = signal(user)
  const editing = signal(false)

  const profileContent = computed(() => {
    const currentUser = profileUser.value

    if (editing.value) {
      return (
        <Card class="profile-card profile-card-editing">
          <ProfileEditor
            user={currentUser}
            onSaved={updatedUser => {
              profileUser.value = updatedUser
              editing.value = false
              onUpdated(updatedUser)
            }}
            onCancel={() => editing.value = false}
          />
        </Card>
      )
    }

    return (
      <ProfileHero
        user={currentUser}
        actions={
          <>
            <Button variant="tertiary" size="small" onClick={() => editing.value = true}>Edit profile</Button>
          </>
        }
      />
    )
  })

  return profileContent
}
