import { Button, CheckBox, FormField, TextField, signal } from '../lib/vendor.js'
import { clientEnv } from '../config/env.js'

const apiUrl = clientEnv.apiUrl.replace(/\/$/, '')

function resizeImage(file, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Could not decode image'))
      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function ProfileEditor({ user, onSaved, onCancel }) {
  const displayName = signal(user.profile?.displayName || user.username)
  const bio = signal(user.profile?.bio || '')
  const avatarUrl = signal(user.profile?.avatarUrl || '')
  const bannerUrl = signal(user.profile?.bannerUrl || '')
  const profileVisibility = signal(user.profile?.profileVisibility || 'public')
  const showFollowers = signal(user.profile?.showFollowers !== false)
  const showFollowing = signal(user.profile?.showFollowing !== false)
  const error = signal('')
  const busy = signal(false)

  async function chooseImage(event, target, maxWidth, maxHeight) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      error.value = 'Choose an image file.'
      return
    }
    try {
      target.value = await resizeImage(file, maxWidth, maxHeight)
      error.value = ''
    } catch (imageError) {
      error.value = imageError.message
    } finally {
      event.target.value = ''
    }
  }

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
          bio: bio.value,
          avatarUrl: avatarUrl.value || null,
          bannerUrl: bannerUrl.value || null,
          profileVisibility: profileVisibility.value,
          showFollowers: showFollowers.value,
          showFollowing: showFollowing.value
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
      <div class="profile-image-fields">
        <FormField id="profile-avatar" label="Avatar" hint="Square image, resized before upload.">
          <input id="profile-avatar" type="file" accept="image/*" onChange={event => chooseImage(event, avatarUrl, 400, 400)} />
          {avatarUrl.value && <img class="profile-editor-avatar-preview" src={avatarUrl} alt="Avatar preview" />}
          {avatarUrl.value && <Button type="button" variant="tertiary" size="small" onClick={() => avatarUrl.value = ''}>Remove avatar</Button>}
        </FormField>
        <FormField id="profile-banner" label="Banner" hint="Wide image, resized before upload.">
          <input id="profile-banner" type="file" accept="image/*" onChange={event => chooseImage(event, bannerUrl, 1200, 420)} />
          {bannerUrl.value && <img class="profile-editor-banner-preview" src={bannerUrl} alt="Banner preview" />}
          {bannerUrl.value && <Button type="button" variant="tertiary" size="small" onClick={() => bannerUrl.value = ''}>Remove banner</Button>}
        </FormField>
      </div>
      <FormField id="profile-visibility" label="Profile privacy" hint="Followers-only profiles still show your name and handle.">
        <select id="profile-visibility" use:bind={profileVisibility}>
          <option value="public">Public profile</option>
          <option value="followers">Followers only</option>
        </select>
      </FormField>
      <div class="profile-privacy-options">
        <CheckBox checked={showFollowers}>Show followers list</CheckBox>
        <CheckBox checked={showFollowing}>Show following list</CheckBox>
      </div>
      <div class="profile-editor-error" role="alert">{error}</div>
      <div class="profile-editor-actions">
        <Button type="submit" loading={busy}>Save profile</Button>
        <Button type="button" variant="tertiary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
