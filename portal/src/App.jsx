import { io } from 'socket.io-client'
import { clientEnv } from './config/env.js'
import { AuthGate } from './components/AuthGate.jsx'
import { apiRequest } from './lib/api.js'
import { acceptRealtimeEvent, configureRealtimeSocket } from './lib/realtime.js'
import {
  Background,
  computed,
  onMount,
  prismTheme,
  signal
} from './lib/vendor.js'

const apiUrl = clientEnv.apiUrl.replace(/\/$/, '')
const sessionRequestTimeoutMs = 10000

function fetchWithTimeout(url, options = {}, timeoutMs = sessionRequestTimeoutMs) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => window.clearTimeout(timeout))
}

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
  let socket
  let active = true

  function loadUnreadNotifications() {
    fetchWithTimeout(`${apiUrl}/api/notifications/unread-count`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(countResult => {
        if (countResult?.ok) unreadNotifications.value = countResult.data.unreadCount
      })
      .catch(() => {})
  }

  function connectSocket() {
    if (socket) return

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

  function completeAuthentication(user) {
    if (!user?.id || !user.username) {
      throw new Error('Login response was incomplete. Please try again.')
    }

    currentUser.value = user
    authStatus.value = 'authenticated'
    queueMicrotask(() => {
      if (!active) return
      loadUnreadNotifications()
      try {
        connectSocket()
      } catch {
        socketStatus.value = 'disconnected'
      }
    })
  }

  const statusLabel = computed(() => {
    if (status.value === 'ready') return 'API online'
    if (status.value === 'offline') return 'API offline'
    return 'Checking API'
  })
  onMount(() => {
    active = true
    fetchWithTimeout(`${apiUrl}/api/health`)
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

    fetchWithTimeout(`${apiUrl}/api/auth/me`, { credentials: 'include' })
      .then(async response => {
        if (response.status === 401) {
          if (active && authStatus.value !== 'authenticated') authStatus.value = 'anonymous'
          return null
        }
        if (!response.ok) throw new Error('Session check failed')
        return response.json()
      })
      .then(result => {
        if (!result || !active) return
        try {
          completeAuthentication(result.data.user)
        } catch {
          try { currentUser.value = null } catch { /* current user may already be unset */ }
          if (active) authStatus.value = 'anonymous'
        }
      })
      .catch(() => {
        if (active && authStatus.value === 'checking') authStatus.value = 'anonymous'
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
      <Background class="echo-background" palette="midnight" animation={reducedMotion ? undefined : 'halo'} intensity={0.65} grain={0.018} minHeight="100vh">
        <AuthGate
          authStatus={authStatus}
          currentUser={currentUser}
          apiStatus={statusLabel}
          socketStatus={socketStatus}
          unreadNotifications={unreadNotifications}
          notificationVersion={notificationVersion}
          onAuthenticated={completeAuthentication}
          onLogout={logout}
          onUpdated={user => currentUser.value = user}
        />
      </Background>
    </div>
  )
}
