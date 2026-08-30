import { computed, signal } from '../lib/vendor.js'
import { Alert, Button, Card, FormField, Label, Stack, Tabs, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

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
  }

  async function submit(event, submitMode) {
    event.preventDefault()
    error.value = ''
    fieldErrors.value = {}
    busy.value = true

    const payload = submitMode === 'login'
      ? { identifier: identifier.value, password: password.value }
      : {
        username: username.value,
        email: email.value,
        displayName: displayName.value,
        password: password.value
    }

    try {
      const result = await apiRequest(`/api/auth/${submitMode}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      onAuthenticated(result.data.user)
    } catch (requestError) {
      fieldErrors.value = requestError.details?.fieldErrors || {}
      error.value = Object.keys(fieldErrors.value).length
        ? 'Fix the marked fields and try again.'
        : requestError.message || 'Could not complete sign in'
    } finally {
      busy.value = false
    }
  }

  function loginForm() {
    return (
      <form class="auth-form" onSubmit={event => submit(event, 'login')}>
        <Stack gap="medium">
          <FormField id="auth-identifier" label="Username or email" required>
            <TextField
              id="auth-identifier"
              value={identifier}
              placeholder="you@example.com or username"
              autocomplete="username"
              required
            />
          </FormField>
          <FormField id="auth-login-password" label="Password" required hint="Use your Echo password.">
            <TextField
              id="auth-login-password"
              value={password}
              type="password"
              placeholder="Your password"
              autocomplete="current-password"
              required
            />
          </FormField>
          {errorView}
          <Button type="submit" fullWidth loading={busy}>Log in</Button>
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
            <TextField
              id="auth-register-password"
              value={password}
              type="password"
              placeholder="Create a password"
              autocomplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </FormField>
          {errorView}
          <Button type="submit" fullWidth loading={busy}>Create account</Button>
        </Stack>
      </form>
    )
  }

  const tabs = computed(() => [
    { id: 'login', label: 'Log in', content: loginForm() },
    { id: 'register', label: 'Sign up', content: registerForm() }
  ])

  return (
    <Card class="auth-card">
      <Stack gap="large" class="auth-content">
        <Stack gap="small" class="auth-intro">
          <Label size="small" tone="accent">ECHO / ACCOUNT</Label>
          <h1>{title}</h1>
          <p class="auth-description">{description}</p>
        </Stack>
        <Tabs
          class="auth-tabs"
          items={tabs}
          activeTab={mode}
          ariaLabel="Account access"
          onTabChange={setMode}
        />
      </Stack>
    </Card>
  )
}
