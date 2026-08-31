import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, FormField, Label, Select } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

const preferenceOptions = Object.freeze([
  { type: 'reply', label: 'Replies to your posts' },
  { type: 'like', label: 'Likes on your posts' },
  { type: 'follow', label: 'New followers' },
  { type: 'channel_invite', label: 'Channel invites' },
  { type: 'channel_join', label: 'People joining your channels' },
  { type: 'channel_post', label: 'Activity in your channels' },
  { type: 'chat_message', label: 'Chat messages' }
])

function browserPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export function NotificationPreferences() {
  const preferences = signal([])
  const emailEnabled = signal(false)
  const digestFrequency = signal('never')
  const browserPermissionState = signal('checking')
  const state = signal('loading')
  const error = signal('')
  const saved = signal('')
  const emailSaved = signal('')
  const saving = signal(false)
  const emailSaving = signal(false)

  async function load() {
    state.value = 'loading'
    error.value = ''
    try {
      const result = await apiRequest('/api/me/notification-preferences')
      preferences.value = result.data.preferences
      emailEnabled.value = result.data.email.enabled
      digestFrequency.value = result.data.email.digestFrequency
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load notification preferences'
      state.value = 'error'
    }
  }

  function togglePreference(type) {
    preferences.value = preferences.value.map(preference => preference.type === type
      ? { ...preference, enabled: !preference.enabled }
      : preference)
  }

  async function savePreferences() {
    saving.value = true
    saved.value = ''
    error.value = ''
    try {
      const result = await apiRequest('/api/me/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: preferences.value })
      })
      preferences.value = result.data.preferences
      saved.value = 'Saved'
    } catch (requestError) {
      error.value = requestError.message || 'Could not save notification preferences'
    } finally {
      saving.value = false
    }
  }

  async function saveEmailPreferences() {
    emailSaving.value = true
    emailSaved.value = ''
    error.value = ''
    try {
      const result = await apiRequest('/api/me/email-preferences', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: emailEnabled.value,
          digestFrequency: digestFrequency.value
        })
      })
      emailEnabled.value = result.data.email.enabled
      digestFrequency.value = result.data.email.digestFrequency
      emailSaved.value = 'Saved. Email delivery is not active yet.'
    } catch (requestError) {
      error.value = requestError.message || 'Could not save email preferences'
    } finally {
      emailSaving.value = false
    }
  }

  async function requestBrowserPermission() {
    if (browserPermissionState.value === 'unsupported') return
    try {
      browserPermissionState.value = await window.Notification.requestPermission()
    } catch {
      error.value = 'Could not request browser notification permission'
    }
  }

  const browserControl = computed(() => {
    if (browserPermissionState.value === 'checking') return <span>Checking browser support…</span>
    if (browserPermissionState.value === 'unsupported') return <span>This browser does not support notifications.</span>
    if (browserPermissionState.value === 'granted') return <span>Browser notifications enabled.</span>
    if (browserPermissionState.value === 'denied') return <span>Notifications blocked. Allow them in browser settings.</span>
    return <Button variant="secondary" size="small" onClick={requestBrowserPermission}>Enable browser notifications</Button>
  })

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading preferences…</div></Card>
    if (state.value === 'error') return <Card><div class="post-feed-error" role="alert">{error}</div><Button variant="secondary" onClick={load}>Try again</Button></Card>
    return (
      <div class="notification-preferences">
        <Card class="notification-preferences-card">
          <Label size="small" tone="accent">IN-APP EVENTS</Label>
          <p>Choose which events create notifications in your Echo inbox.</p>
          <div class="notification-preference-list">
            {preferenceOptions.map(option => (
              <CheckBox
                key={option.type}
                checked={computed(() => preferences.value.find(preference => preference.type === option.type)?.enabled !== false)}
                onChange={() => togglePreference(option.type)}
              >
                {option.label}
              </CheckBox>
            ))}
          </div>
          <div class="notification-preference-actions">
            <Button loading={saving} onClick={savePreferences}>Save event preferences</Button>
            {saved.value && <span>{saved.value}</span>}
          </div>
        </Card>
        <Card class="notification-preferences-card">
          <Label size="small" tone="accent">EMAIL</Label>
          <p>Store email delivery preferences now. Echo does not send email yet.</p>
          <CheckBox checked={emailEnabled}>Allow email notifications</CheckBox>
          <FormField id="email-digest-frequency" label="Digest frequency">
            <Select
              id="email-digest-frequency"
              value={digestFrequency}
              ariaLabel="Digest frequency"
              options={[
                { value: 'never', label: 'Never' },
                { value: 'daily', label: 'Daily digest' },
                { value: 'weekly', label: 'Weekly digest' }
              ]}
            />
          </FormField>
          <div class="notification-preference-actions">
            <Button loading={emailSaving} onClick={saveEmailPreferences}>Save email preference</Button>
            {emailSaved.value && <span>{emailSaved.value}</span>}
          </div>
        </Card>
        <Card class="notification-preferences-card">
          <Label size="small" tone="accent">BROWSER</Label>
          <p>Get a small alert when a new inbox notification arrives while Echo is open.</p>
          <div class="browser-permission-control">{browserControl}</div>
        </Card>
        <div class="post-feed-error" role="alert">{error}</div>
      </div>
    )
  })

  onMount(() => {
    browserPermissionState.value = browserPermission()
    load()
  })

  return content
}
