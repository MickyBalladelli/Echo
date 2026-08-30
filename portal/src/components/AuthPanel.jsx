import { computed, html, signal } from '../lib/vendor.js'
import { Button, Card, FormField, Label, TextField } from '../lib/vendor.js'
import { clientEnv } from '../config/env.js'

const apiUrl = clientEnv.apiUrl.replace(/\/$/, '')

export function AuthPanel({ onAuthenticated }) {
  const mode = signal('login')
  const identifier = signal('')
  const email = signal('')
  const username = signal('')
  const displayName = signal('')
  const password = signal('')
  const error = signal('')
  const busy = signal(false)

  const title = computed(() => mode.value === 'login' ? 'Welcome back' : 'Join Echo')
  const description = computed(() => mode.value === 'login'
    ? 'Sign in to follow people, write notes, and chat.'
    : 'Make an account. Find your people. Start talking.')
  const submitLabel = computed(() => mode.value === 'login' ? 'Log in' : 'Create account')
  const identityFields = computed(() => mode.value === 'login'
    ? FormField({
      id: 'auth-identifier',
      label: 'Username or email',
      required: true,
      children: TextField({
        id: 'auth-identifier',
        value: identifier,
        placeholder: 'you@example.com or username',
        autocomplete: 'username',
        required: true
      })
    })
    : html`
      ${FormField({
        id: 'auth-username',
        label: 'Username',
        required: true,
        children: TextField({
          id: 'auth-username',
          value: username,
          placeholder: 'your_name',
          autocomplete: 'username',
          required: true
        })
      })}
      ${FormField({
        id: 'auth-email',
        label: 'Email',
        required: true,
        children: TextField({
          id: 'auth-email',
          value: email,
          placeholder: 'you@example.com',
          type: 'email',
          autocomplete: 'email',
          required: true
        })
      })}
      ${FormField({
        id: 'auth-display-name',
        label: 'Display name',
        required: true,
        children: TextField({
          id: 'auth-display-name',
          value: displayName,
          placeholder: 'Your name',
          autocomplete: 'name',
          required: true
        })
      })}
    `)

  function setMode(nextMode) {
    mode.value = nextMode
    error.value = ''
  }

  async function submit(event) {
    event.preventDefault()
    error.value = ''
    busy.value = true

    const payload = mode.value === 'login'
      ? { identifier: identifier.value, password: password.value }
      : {
        username: username.value,
        email: email.value,
        displayName: displayName.value,
        password: password.value
      }

    try {
      const response = await fetch(`${apiUrl}/api/auth/${mode.value}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      const result = await response.json()

      if (!response.ok || !result.ok) {
        error.value = result.error?.message || 'Could not complete sign in'
        return
      }

      onAuthenticated(result.data.user)
    } catch {
      error.value = 'Server unavailable. Try again.'
    } finally {
      busy.value = false
    }
  }

  return (
    <Card class="auth-card">
      <Label size="small" tone="accent">ECHO / ACCOUNT</Label>
      <h1>{title}</h1>
      <p class="auth-description">{description}</p>
      <div class="auth-tabs" role="tablist" aria-label="Account access">
        <Button
          variant={computed(() => mode.value === 'login' ? 'primary' : 'secondary')}
          pressed={computed(() => mode.value === 'login')}
          onClick={() => setMode('login')}
        >
          Log in
        </Button>
        <Button
          variant={computed(() => mode.value === 'register' ? 'primary' : 'secondary')}
          pressed={computed(() => mode.value === 'register')}
          onClick={() => setMode('register')}
        >
          Sign up
        </Button>
      </div>
      <form class="auth-form" onSubmit={submit}>
        {identityFields}
        {FormField({
          id: 'auth-password',
          label: 'Password',
          required: true,
          children: TextField({
            id: 'auth-password',
            value: password,
            type: 'password',
            placeholder: 'At least 8 characters',
            autocomplete: computed(() => mode.value === 'login' ? 'current-password' : 'new-password'),
            required: true
          })
        })}
        <div class="auth-error" role="alert" aria-live="polite">{error}</div>
        <Button type="submit" fullWidth loading={busy}>
          {submitLabel}
        </Button>
      </form>
    </Card>
  )
}
