import { io } from 'socket.io-client'
import { clientEnv } from './config/env.js'
import { AuthPanel } from './components/AuthPanel.jsx'
import { AppShell } from './components/AppShell.jsx'
import { apiRequest } from './lib/api.js'
import { acceptRealtimeEvent, configureRealtimeSocket } from './lib/realtime.js'
import {
  Background,
  Button,
  Card,
  Alert,
  Label,
  Stack,
  computed,
  onMount,
  prismTheme,
  signal
} from './lib/vendor.js'

const apiUrl = clientEnv.apiUrl.replace(/\/$/, '')

function showBrowserNotification() {
  if (typeof window === 'undefined' || !('Notification' in window) || window.Notification.permission !== 'granted') return
  try {
    new window.Notification('Echo', { body: 'You have a new notification' })
  } catch {
    // Browser notifications can fail when the page is not focused or permission changed.
  }
}

export function App() {
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const status = signal('checking')
  const authStatus = signal('checking')
  const currentUser = signal(null)
  const socketStatus = signal('connecting')
  const unreadNotifications = signal(0)
  const notificationVersion = signal(0)
  const statusLabel = computed(() => {
    if (status.value === 'ready') return 'API online'
    if (status.value === 'offline') return 'API offline'
    return 'Checking API'
  })
  const authView = computed(() => {
    if (authStatus.value === 'checking') {
      return <Card class="auth-card"><Stack gap="medium"><Label size="small" tone="accent">ECHO / ACCOUNT</Label><h1>Checking session</h1><Label tone="muted">One moment.</Label></Stack></Card>
    }

    if (authStatus.value === 'anonymous') {
      return <AuthPanel onAuthenticated={user => {
        currentUser.value = user
        authStatus.value = 'authenticated'
        window.location.reload()
      }} />
    }

    if (authStatus.value === 'offline') {
      return <Card class="auth-card"><Stack gap="medium"><Label size="small" tone="accent">ECHO / ACCOUNT</Label><h1>Server offline</h1><Alert tone="error" title="Connection problem">Echo cannot check your session right now.</Alert><Button onClick={() => window.location.reload()}>Try again</Button></Stack></Card>
    }

    return <AppShell
      userState={currentUser}
      apiStatus={statusLabel}
      socketStatus={socketStatus}
      unreadNotifications={unreadNotifications}
      notificationVersion={notificationVersion}
      onLogout={logout}
      onUpdated={user => currentUser.value = user}
    />
  })

  onMount(() => {
    let socket
    let active = true

    const connectSocket = () => {
      socket = io(clientEnv.socketUrl, {
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000
      })
      configureRealtimeSocket(socket)
      socket.on('connect', () => {
        socketStatus.value = 'syncing'
      })
      socket.on('connection:ready', () => {
        socketStatus.value = 'connected'
      })
      socket.on('disconnect', () => {
        socketStatus.value = socket.active ? 'reconnecting' : 'disconnected'
      })
      socket.on('connect_error', error => {
        socketStatus.value = error.message === 'AUTH_REQUIRED' ? 'auth required' : 'reconnecting'
      })
      socket.io.on('reconnect_attempt', () => {
        socketStatus.value = 'reconnecting'
      })
      socket.on('notification:new', envelope => {
        if (!acceptRealtimeEvent(envelope)) return
        unreadNotifications.value = envelope.data.unreadCount
        notificationVersion.value += 1
        showBrowserNotification()
      })
    }

    fetch(`${apiUrl}/api/health`)
      .then(response => {
        if (!response.ok) {
          throw new Error('API health check failed')
        }

        return response.json()
      })
      .then(() => {
        if (active) status.value = 'ready'
      })
      .catch(() => {
        if (active) status.value = 'offline'
      })

    fetch(`${apiUrl}/api/auth/me`, { credentials: 'include' })
      .then(async response => {
        if (response.status === 401) {
          authStatus.value = 'anonymous'
          return null
        }
        if (!response.ok) throw new Error('Session check failed')
        return response.json()
      })
      .then(result => {
        if (!result || !active) return
        currentUser.value = result.data.user
        authStatus.value = 'authenticated'
        fetch(`${apiUrl}/api/notifications/unread-count`, { credentials: 'include' })
          .then(response => response.ok ? response.json() : null)
          .then(countResult => {
            if (countResult?.ok) unreadNotifications.value = countResult.data.unreadCount
          })
          .catch(() => {})
        connectSocket()
      })
      .catch(() => {
        if (active) authStatus.value = 'offline'
      })

    return () => {
      active = false
      socket?.close()
    }
  })

  async function logout() {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <div class="echo-root prism-theme-model-nocturne" use:style={prismTheme}>
      <Background palette="midnight" animation={reducedMotion ? undefined : 'veil'} intensity={0.65} grain={0.018} minHeight="100vh">
        {authView}
      </Background>
    </div>
  )
}
