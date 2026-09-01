import { computed } from '../lib/vendor.js'
import { Alert, Button, Card, Label, Stack } from '../lib/vendor.js'
import { AuthPanel } from './AuthPanel.jsx'
import { AppShell } from './AppShell.jsx'

export function AuthGate({
  authStatus,
  currentUser,
  apiStatus,
  socketStatus,
  unreadNotifications,
  notificationVersion,
  onAuthenticated,
  onLogout,
  onUpdated
}) {
  const view = computed(() => {
    if (authStatus.value === 'checking') {
      return (
        <Card class="auth-card">
          <Stack gap="medium">
            <Label size="small" tone="accent">ECHO / ACCOUNT</Label>
            <h1>Checking session</h1>
            <Label tone="muted">One moment.</Label>
          </Stack>
        </Card>
      )
    }

    if (authStatus.value === 'anonymous') {
      return <AuthPanel onAuthenticated={onAuthenticated} />
    }

    if (authStatus.value === 'offline') {
      return (
        <Card class="auth-card">
          <Stack gap="medium">
            <Label size="small" tone="accent">ECHO / ACCOUNT</Label>
            <h1>Server offline</h1>
            <Alert tone="error" title="Connection problem">Echo cannot check your session right now.</Alert>
            <Button onClick={() => window.location.reload()}>Try again</Button>
          </Stack>
        </Card>
      )
    }

    if (!currentUser.value) {
      return (
        <Card class="auth-card">
          <Stack gap="medium">
            <Label size="small" tone="accent">ECHO / ACCOUNT</Label>
            <h1>Finishing sign in</h1>
            <Label tone="muted">One moment.</Label>
          </Stack>
        </Card>
      )
    }

    return (
      <AppShell
        userState={currentUser}
        apiStatus={apiStatus}
        socketStatus={socketStatus}
        unreadNotifications={unreadNotifications}
        notificationVersion={notificationVersion}
        onLogout={onLogout}
        onUpdated={onUpdated}
      />
    )
  })

  return view
}
