import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, FormField, Label, Select, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { setAppLocale } from '../lib/i18n.js'
import { PasswordField } from './PasswordField.jsx'

function shortDevice(userAgent) {
  if (!userAgent) return 'Unknown device'
  if (/mobile|android|iphone/i.test(userAgent)) return 'Mobile browser'
  if (/safari/i.test(userAgent)) return 'Safari browser'
  if (/chrome|chromium/i.test(userAgent)) return 'Chrome browser'
  if (/firefox/i.test(userAgent)) return 'Firefox browser'
  return 'Desktop browser'
}

export function AdvancedSettings({ user, onDeleted }) {
  const sessions = signal([])
  const twoFactor = signal({ enabled: false, setup: null })
  const twoFactorCode = signal('')
  const locale = signal(user.profile?.locale || 'en')
  const providers = signal([])
  const accounts = signal([])
  const scheduledPosts = signal([])
  const analytics = signal([])
  const emailToken = signal(typeof localStorage === 'undefined' ? '' : localStorage.getItem('echo:email-verification-token') || '')
  const resetToken = signal('')
  const resetPassword = signal('')
  const message = signal('')
  const error = signal('')
  const busy = signal(false)

  async function load() {
    try {
      const [sessionResult, factorResult, providerResult, accountResult, scheduledResult, analyticsResult] = await Promise.all([
        apiRequest('/api/me/sessions'),
        apiRequest('/api/me/2fa'),
        apiRequest('/api/auth/oauth/providers'),
        apiRequest('/api/me/oauth'),
        apiRequest('/api/posts/scheduled'),
        apiRequest('/api/me/analytics?days=30')
      ])
      sessions.value = sessionResult.data.sessions
      twoFactor.value = factorResult.data
      providers.value = providerResult.data.providers
      accounts.value = accountResult.data.accounts
      scheduledPosts.value = scheduledResult.data.scheduledPosts
      analytics.value = analyticsResult.data.events
    } catch (requestError) {
      error.value = requestError.message || 'Could not load account controls'
    }
  }

  async function revokeSession(sessionId) {
    await apiRequest(`/api/me/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    sessions.value = sessions.value.filter(session => session.id !== sessionId)
    message.value = 'Session revoked'
  }

  async function revokeOthers() {
    await apiRequest('/api/me/sessions', { method: 'DELETE' })
    sessions.value = sessions.value.filter(session => session.current)
    message.value = 'Other sessions revoked'
  }

  async function setupTwoFactor() {
    const result = await apiRequest('/api/me/2fa/setup', { method: 'POST', body: JSON.stringify({}) })
    twoFactor.value = { enabled: false, setup: result.data }
    message.value = 'Scan the secret with an authenticator app, then verify it below.'
  }

  async function enableTwoFactor(event) {
    event.preventDefault()
    const result = await apiRequest('/api/me/2fa/enable', {
      method: 'POST', body: JSON.stringify({ code: twoFactorCode.value })
    })
    twoFactor.value = { enabled: result.data.enabled, setup: null }
    twoFactorCode.value = ''
    message.value = 'Two-factor authentication enabled'
  }

  async function disableTwoFactor(event) {
    event.preventDefault()
    const result = await apiRequest('/api/me/2fa/disable', {
      method: 'POST', body: JSON.stringify({ code: twoFactorCode.value })
    })
    twoFactor.value = { enabled: result.data.enabled, setup: null }
    twoFactorCode.value = ''
    message.value = 'Two-factor authentication disabled'
  }

  async function saveLocale(event) {
    event.preventDefault()
    const result = await apiRequest('/api/me/locale', {
      method: 'PUT', body: JSON.stringify({ locale: locale.value })
    })
    setAppLocale(result.data.locale)
    message.value = `Language saved: ${result.data.locale}`
  }

  async function requestReset(event) {
    event.preventDefault()
    const result = await apiRequest('/api/auth/password-reset/request', {
      method: 'POST', body: JSON.stringify({ identifier: user.email })
    })
    resetToken.value = result.data.resetToken || ''
    message.value = 'Password reset requested. Check your email when delivery is configured.'
  }

  async function confirmReset(event) {
    event.preventDefault()
    const result = await apiRequest('/api/auth/password-reset/confirm', {
      method: 'POST', body: JSON.stringify({ token: resetToken.value, password: resetPassword.value })
    })
    if (!result.data.reset) throw new Error('Reset token is invalid or expired')
    resetPassword.value = ''
    message.value = 'Password changed. Other sessions were signed out.'
  }

  async function verifyEmail(event) {
    event.preventDefault()
    const result = await apiRequest('/api/auth/verify-email', {
      method: 'POST', body: JSON.stringify({ token: emailToken.value })
    })
    if (result.data.verified) {
      localStorage.removeItem('echo:email-verification-token')
      message.value = 'Email verified'
    } else {
      message.value = 'Verification token is invalid or expired'
    }
  }

  async function requestVerification() {
    const result = await apiRequest('/api/auth/verify-email/request', { method: 'POST', body: JSON.stringify({}) })
    emailToken.value = result.data.verificationToken || ''
    message.value = 'Verification requested. Check your email when delivery is configured.'
  }

  async function cancelScheduled(id) {
    await apiRequest(`/api/posts/scheduled/${encodeURIComponent(id)}`, { method: 'DELETE' })
    scheduledPosts.value = scheduledPosts.value.map(item => item.id === id ? { ...item, status: 'cancelled' } : item)
  }

  async function exportData() {
    const result = await apiRequest('/api/me/export')
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'echo-data-export.json'
    link.click()
    URL.revokeObjectURL(url)
    message.value = 'Data export downloaded'
  }

  async function deleteAccount() {
    if (!window.confirm('Delete your Echo account? This signs you out and hides your content.')) return
    await apiRequest('/api/me/account', { method: 'DELETE' })
    onDeleted?.()
  }

  async function run(action) {
    busy.value = true
    error.value = ''
    try {
      await action()
    } catch (requestError) {
      error.value = requestError.message || 'Could not update account'
    } finally {
      busy.value = false
    }
  }

  const factorContent = computed(() => twoFactor.value.enabled
    ? <form class="advanced-inline-form" onSubmit={event => run(() => disableTwoFactor(event))}>
      <FormField id="disable-2fa-code" label="Authenticator code" required>
        <TextField id="disable-2fa-code" value={twoFactorCode} inputmode="numeric" maxLength={6} required />
      </FormField>
      <Button type="submit" variant="tertiary" loading={busy}>Disable 2FA</Button>
    </form>
    : <>
      {!twoFactor.value.setup && <Button onClick={() => run(setupTwoFactor)}>Set up 2FA</Button>}
      {twoFactor.value.setup && <form class="advanced-inline-form" onSubmit={event => run(() => enableTwoFactor(event))}>
        <p>Secret: <code>{twoFactor.value.setup.secret}</code></p>
        <p>Authenticator URI: <code>{twoFactor.value.setup.otpauthUrl}</code></p>
        <FormField id="enable-2fa-code" label="Authenticator code" required>
          <TextField id="enable-2fa-code" value={twoFactorCode} inputmode="numeric" maxLength={6} required />
        </FormField>
        <Button type="submit" loading={busy}>Enable 2FA</Button>
      </form>}
    </>)

  onMount(() => {
    setAppLocale(locale.value)
    load()
  })

  return (
    <div class="advanced-settings-stack">
      <Card class="advanced-settings-card">
        <Label size="small" tone="accent">SECURITY</Label>
        <h2>Multi-device sessions</h2>
        <p>Sign out browsers you no longer use.</p>
        <div class="session-list">
          {sessions.value.map(session => (
            <div key={session.id} class="session-row">
              <div><strong>{shortDevice(session.userAgent)}</strong><span>{session.current ? 'This device' : session.userAgent}</span></div>
              {!session.current && <Button variant="tertiary" size="small" onClick={() => run(() => revokeSession(session.id))}>Revoke</Button>}
            </div>
          ))}
        </div>
        <Button variant="secondary" size="small" onClick={() => run(revokeOthers)}>Sign out other devices</Button>
      </Card>
      <Card class="advanced-settings-card">
        <Label size="small" tone="accent">AUTHENTICATION</Label>
        <h2>Two-factor authentication</h2>
        <p>{twoFactor.value.enabled ? 'Authenticator protection is enabled.' : 'Protect sign in with a TOTP authenticator.'}</p>
        {factorContent}
      </Card>
      <Card class="advanced-settings-card">
        <Label size="small" tone="accent">ACCOUNT RECOVERY</Label>
        <p>{user.emailVerified ? 'Your email is verified.' : 'Verify your email to make account recovery safer.'}</p>
        {!user.emailVerified && <form class="advanced-inline-form" onSubmit={event => run(() => verifyEmail(event))}>
          <FormField id="email-verification-token" label="Verification token"><TextField id="email-verification-token" value={emailToken} /></FormField>
          <Button type="submit" size="small" loading={busy}>Verify email</Button>
        </form>}
        {!user.emailVerified && <Button variant="tertiary" size="small" onClick={() => run(requestVerification)}>Request verification</Button>}
        <form class="advanced-inline-form" onSubmit={event => run(() => requestReset(event))}>
          <Button type="submit" variant="tertiary" loading={busy}>Request password reset</Button>
        </form>
        {resetToken.value && <form class="advanced-inline-form" onSubmit={event => run(() => confirmReset(event))}>
          <FormField id="password-reset-token" label="Reset token"><TextField id="password-reset-token" value={resetToken} required /></FormField>
          <FormField id="password-reset-password" label="New password"><PasswordField id="password-reset-password" value={resetPassword} minLength={8} required /></FormField>
          <Button type="submit" loading={busy}>Change password</Button>
        </form>}
      </Card>
      <Card class="advanced-settings-card">
        <Label size="small" tone="accent">LANGUAGE</Label>
        <form class="advanced-inline-form" onSubmit={event => run(() => saveLocale(event))}>
          <FormField id="account-locale" label="Language">
            <Select
              id="account-locale"
              value={locale}
              ariaLabel="Language"
              options={[
                { value: 'en', label: 'English' },
                { value: 'fr', label: 'Français' },
                { value: 'de', label: 'Deutsch' },
                { value: 'es', label: 'Español' },
                { value: 'it', label: 'Italiano' },
                { value: 'ja', label: '日本語' }
              ]}
            />
          </FormField>
          <Button type="submit" loading={busy}>Save language</Button>
        </form>
      </Card>
      <Card class="advanced-settings-card">
        <Label size="small" tone="accent">OAUTH</Label>
        <p>Provider hooks are ready for credentials and callback wiring.</p>
        {providers.value.map(provider => <div key={provider.provider} class="session-row"><strong>{provider.provider}</strong><span>{provider.configured ? 'Configured' : 'Needs credentials'}</span></div>)}
        {accounts.value.map(account => <small key={account.id}>Linked: {account.provider}</small>)}
      </Card>
      <Card class="advanced-settings-card">
        <Label size="small" tone="accent">SCHEDULED POSTS</Label>
        {scheduledPosts.value.filter(item => item.status === 'pending').map(item => (
          <div key={item.id} class="session-row"><span>{new Date(item.scheduledAt).toLocaleString()}</span><Button variant="tertiary" size="small" onClick={() => run(() => cancelScheduled(item.id))}>Cancel</Button></div>
        ))}
        {!scheduledPosts.value.some(item => item.status === 'pending') && <p>No pending scheduled posts.</p>}
      </Card>
      <Card class="advanced-settings-card">
        <Label size="small" tone="accent">PRIVACY-SAFE ANALYTICS</Label>
        <p>Only allowlisted event names and small properties are stored. No IP address or raw session data is tracked.</p>
        <div class="analytics-summary">{analytics.value.map(item => <span key={`${item.day}-${item.eventName}`}>{item.day}: {item.eventName} · {item.count}</span>)}</div>
      </Card>
      <Card class="advanced-settings-card advanced-danger-zone">
        <Label size="small" tone="accent">YOUR DATA</Label>
        <p>Download a JSON copy of your data or deactivate your account.</p>
        <div class="profile-editor-actions"><Button onClick={() => run(exportData)}>Download data</Button><Button variant="tertiary" onClick={() => run(deleteAccount)}>Delete account</Button></div>
      </Card>
      <div class="post-feed-error" role="alert">{error}</div>
      <div class="advanced-settings-message" role="status">{message}</div>
    </div>
  )
}
