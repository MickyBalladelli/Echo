import { Button, FormField, TextField, signal } from '../lib/vendor.js'
import { clientEnv } from '../config/env.js'

const apiUrl = clientEnv.apiUrl.replace(/\/$/, '')

export function ProfileEditor({ user, onSaved, onCancel }) {
  const displayName = signal(user.profile?.displayName || user.username)
  const bio = signal(user.profile?.bio || '')
  const error = signal('')
  const busy = signal(false)

  async function save(event) {
    event.preventDefault()
    error.value = ''
    busy.value = true

    try {
      const response = await fetch(`${apiUrl}/api/me/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: displayName.value,
          bio: bio.value
        })
      })
      const result = await response.json()

      if (!response.ok || !result.ok) {
        error.value = result.error?.message || 'Could not save profile'
        return
      }

      onSaved(result.data.user)
    } catch {
      error.value = 'Server unavailable. Try again.'
    } finally {
      busy.value = false
    }
  }

  return (
    <form class="profile-editor" onSubmit={save}>
      <FormField id="profile-display-name" label="Display name" required>
        <TextField id="profile-display-name" value={displayName} required maxLength={80} />
      </FormField>
      <FormField id="profile-bio" label="Bio">
        <textarea id="profile-bio" use:bind={bio} rows="4" maxlength="280" aria-label="Bio" />
      </FormField>
      <div class="profile-editor-error" role="alert">{error}</div>
      <div class="profile-editor-actions">
        <Button type="submit" loading={busy}>Save profile</Button>
        <Button type="button" variant="tertiary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
