import { computed, onMount, signal } from '../lib/vendor.js'
import { Alert, Button, Card, FormField, Label, Stack, Tabs, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { PasswordField } from './PasswordField.jsx'

export function AuthPanel({ onAuthenticated }) {
  const mode = signal('login')
  const identifier = signal('')
  const email = signal('')
  const username = signal('')
  const displayName = signal('')
  const password = signal('')
  const error = signal('')
  const fieldErrors = signal({})
  const busy = signal(false)
  const twoFactorChallenge = signal('')
  const twoFactorCode = signal('')
  const recoveryOpen = signal(false)
  const recoveryIdentifier = signal('')
  const recoveryToken = signal('')
  const recoveryPassword = signal('')
  const recoveryNotice = signal('')
  const oauthProviders = signal([])
  let active = true

  const title = computed(() => mode.value === 'login' ? 'Welcome back' : 'Join Echo')
  const description = computed(() => mode.value === 'login'
    ? 'Sign in to follow people, write notes, and chat.'
    : 'Make an account. Find your people. Start talking.')
  const errorTitle = computed(() => mode.value === 'login' ? 'Could not log in' : 'Could not create account')
  const errorView = computed(() => error.value
    ? <Alert class="auth-error" tone="error" title={errorTitle}>{error}</Alert>
    : null)

  function setMode(nextMode) {
    mode.value = nextMode
    error.value = ''
    fieldErrors.value = {}
    recoveryOpen.value = false
  }

  function formValue(form, name, fallback) {
    return form?.elements?.namedItem(name)?.value ?? fallback
  }

  async function submit(event, submitMode) {
    event.preventDefault()
    error.value = ''
    fieldErrors.value = {}
    busy.value = true

    const payload = submitMode === 'login'
      ? {
        identifier: formValue(event.currentTarget, 'identifier', identifier.value),
        password: formValue(event.currentTarget, 'password', password.value)
      }
      : {
        username: formValue(event.currentTarget, 'username', username.value),
        email: formValue(event.currentTarget, 'email', email.value),
        displayName: formValue(event.currentTarget, 'displayName', displayName.value),
        password: formValue(event.currentTarget, 'password', password.value)
    }

    try {
      const result = await apiRequest(`/api/auth/${submitMode}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      if (result.data.twoFactorRequired) {
        twoFactorChallenge.value = result.data.challengeToken
        error.value = ''
        return
      }
      if (submitMode === 'register' && result.data.emailVerificationToken && typeof localStorage !== 'undefined') {
        localStorage.setItem('echo:email-verification-token', result.data.emailVerificationToken)
      }
      onAuthenticated(result.data.user)
    } catch (requestError) {
      if (!active) return
      fieldErrors.value = requestError.details?.fieldErrors || {}
      error.value = Object.keys(fieldErrors.value).length
        ? 'Fix the marked fields and try again.'
        : requestError.message || 'Could not complete sign in'
    } finally {
      if (active) busy.value = false
    }
  }

  async function submitTwoFactor(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    try {
      const result = await apiRequest('/api/auth/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ challengeToken: twoFactorChallenge.value, code: twoFactorCode.value })
      })
      onAuthenticated(result.data.user)
    } catch (requestError) {
      if (!active) return
      error.value = requestError.message || 'Could not verify authenticator code'
    } finally {
      if (active) busy.value = false
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    recoveryNotice.value = ''
    try {
      const result = await apiRequest('/api/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ identifier: recoveryIdentifier.value })
      })
      recoveryToken.value = result.data.resetToken || ''
      recoveryNotice.value = 'If the account exists, reset instructions are ready.'
    } catch (requestError) {
      if (!active) return
      error.value = requestError.message || 'Could not request password reset'
    } finally {
      if (active) busy.value = false
    }
  }

  async function confirmPasswordReset(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    try {
      const result = await apiRequest('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: recoveryToken.value, password: recoveryPassword.value })
      })
      if (!result.data.reset) throw new Error('Reset token is invalid or expired')
      recoveryNotice.value = 'Password changed. You can log in now.'
      recoveryOpen.value = false
      recoveryToken.value = ''
      recoveryPassword.value = ''
    } catch (requestError) {
      if (!active) return
      error.value = requestError.message || 'Could not reset password'
    } finally {
      if (active) busy.value = false
    }
  }

  async function startOAuth(provider) {
    error.value = ''
    try {
      const result = await apiRequest(`/api/auth/oauth/${encodeURIComponent(provider)}/start`)
      if (!result.data.authorizationUrl) throw new Error(result.data.message || 'OAuth provider is not configured')
      window.location.assign(result.data.authorizationUrl)
    } catch (requestError) {
      error.value = requestError.message || 'Could not start OAuth sign in'
    }
  }

  function loginForm() {
    return (
      <form class="auth-form" onSubmit={event => submit(event, 'login')}>
        <Stack gap="medium">
          <FormField id="auth-identifier" label="Username or email" required>
            <TextField
              id="auth-identifier"
              name="identifier"
              value={identifier}
              placeholder="you@example.com or username"
              autocomplete="username"
              required
            />
          </FormField>
          <FormField id="auth-login-password" label="Password" required hint="Use your Echo password.">
              <PasswordField
                id="auth-login-password"
                name="password"
                value={password}
                placeholder="Your password"
                autocomplete="current-password"
                required
              />
          </FormField>
          <Button type="submit" fullWidth loading={busy}>Log in</Button>
          <Button type="button" variant="tertiary" onClick={() => recoveryOpen.value = !recoveryOpen.value}>Forgot password?</Button>
          {oauthProviders.value.some(provider => provider.configured) && <div class="auth-oauth-buttons">
            {oauthProviders.value.filter(provider => provider.configured).map(provider => <Button key={provider.provider} type="button" variant="tertiary" onClick={() => startOAuth(provider.provider)}>Continue with {provider.provider}</Button>)}
          </div>}
        </Stack>
      </form>
    )
  }

  function registerForm() {
    return (
      <form class="auth-form" onSubmit={event => submit(event, 'register')}>
        <Stack gap="medium">
          <FormField
            id="auth-username"
            label="Username"
            required
            hint="3–32 lowercase letters, numbers, and underscores."
            error={computed(() => fieldErrors.value.username?.[0])}
          >
            <TextField
              id="auth-username"
              name="username"
              value={username}
              placeholder="your_name"
              autocomplete="username"
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9_]+"
              required
            />
          </FormField>
          <FormField id="auth-email" label="Email" required error={computed(() => fieldErrors.value.email?.[0])}>
            <TextField
              id="auth-email"
              name="email"
              value={email}
              placeholder="you@example.com"
              type="email"
              autocomplete="email"
              maxLength={320}
              required
            />
          </FormField>
          <FormField id="auth-display-name" label="Display name" required error={computed(() => fieldErrors.value.displayName?.[0])}>
            <TextField
              id="auth-display-name"
              name="displayName"
              value={displayName}
              placeholder="Your name"
              autocomplete="name"
              maxLength={80}
              required
            />
          </FormField>
          <FormField
            id="auth-register-password"
            label="Password"
            required
            hint="At least 8 characters."
            error={computed(() => fieldErrors.value.password?.[0])}
          >
            <PasswordField
              id="auth-register-password"
              name="password"
              value={password}
              placeholder="Create a password"
              autocomplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </FormField>
          <Button type="submit" fullWidth loading={busy}>Create account</Button>
        </Stack>
      </form>
    )
  }

  const tabs = computed(() => [
    { id: 'login', label: 'Log in', content: loginForm() },
    { id: 'register', label: 'Sign up', content: registerForm() }
  ])

  const twoFactorForm = computed(() => twoFactorChallenge.value
    ? <form class="auth-form" onSubmit={submitTwoFactor}>
      <Stack gap="medium">
        <Label size="large">Two-factor sign in</Label>
        <p>Enter the six-digit code from your authenticator app.</p>
        <FormField id="auth-two-factor-code" label="Authenticator code" required>
          <TextField id="auth-two-factor-code" value={twoFactorCode} inputmode="numeric" pattern="[0-9]{6}" maxLength={6} required autofocus />
        </FormField>
        <Button type="submit" fullWidth loading={busy}>Verify and log in</Button>
        <Button type="button" variant="tertiary" onClick={() => twoFactorChallenge.value = ''}>Use another account</Button>
      </Stack>
    </form>
    : <Tabs
      class="auth-tabs"
      items={tabs}
      activeTab={mode}
      ariaLabel="Account access"
      onTabChange={setMode}
    />)

  const recoveryForm = computed(() => recoveryOpen.value
    ? <form class="auth-form" onSubmit={recoveryToken.value ? confirmPasswordReset : requestPasswordReset}>
      <Stack gap="medium">
        <Label size="large">Account recovery</Label>
        <FormField id="auth-recovery-identifier" label="Username or email" required>
          <TextField id="auth-recovery-identifier" value={recoveryIdentifier} autocomplete="email" required />
        </FormField>
        {!recoveryToken.value && <Button type="submit" loading={busy}>Request reset</Button>}
        {recoveryToken.value && <>
          <FormField id="auth-recovery-token" label="Reset token" required><TextField id="auth-recovery-token" value={recoveryToken} required /></FormField>
          <FormField id="auth-recovery-new-password" label="New password" required><PasswordField id="auth-recovery-new-password" value={recoveryPassword} minLength={8} required /></FormField>
          <Button type="submit" loading={busy}>Change password</Button>
        </>}
        {recoveryNotice.value && <p role="status">{recoveryNotice}</p>}
      </Stack>
    </form>
    : null)

  onMount(() => {
    apiRequest('/api/auth/oauth/providers')
      .then(result => {
        if (active) oauthProviders.value = result.data.providers
      })
      .catch(() => {})

    return () => {
      active = false
    }
  })

  return (
    <Card class="auth-card">
      <Stack gap="large" class="auth-content">
        <Stack gap="small" class="auth-intro">
          <Label size="small" tone="accent">ECHO / ACCOUNT</Label>
          <h1>{title}</h1>
          <p class="auth-description">{description}</p>
        </Stack>
        {errorView}
        {twoFactorForm}
        {recoveryForm}
      </Stack>
    </Card>
  )
}
