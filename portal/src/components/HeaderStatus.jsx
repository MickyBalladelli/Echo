import { computed, html, Tooltip } from '../lib/vendor.js'

function toneForApi(status) {
  if (status === 'API online') return 'success'
  if (status === 'API offline') return 'error'
  return 'warning'
}

function toneForSocket(status) {
  if (status === 'connected') return 'success'
  if (status === 'connecting' || status === 'syncing' || status === 'reconnecting') return 'warning'
  return 'error'
}

function toneForConnection(apiTone, socketTone) {
  if (apiTone === 'error' || socketTone === 'error') return 'error'
  if (apiTone === 'success' && socketTone === 'success') return 'success'
  return 'warning'
}

function apiStateLabel(status) {
  if (status === 'API online') return 'Online'
  if (status === 'API offline') return 'Offline'
  return 'Checking'
}

function socketStateLabel(status) {
  if (status === 'connected') return 'Connected'
  if (status === 'connecting') return 'Connecting'
  if (status === 'syncing') return 'Syncing'
  if (status === 'reconnecting') return 'Reconnecting'
  if (status === 'auth required') return 'Auth required'
  return 'Offline'
}

export function HeaderStatus({ apiStatus, socketStatus }) {
  const apiTone = computed(() => toneForApi(apiStatus.value))
  const socketTone = computed(() => toneForSocket(socketStatus.value))
  const connectionTone = computed(() => toneForConnection(apiTone.value, socketTone.value))
  const connectionClass = computed(() => `echo-header-status-item is-${connectionTone.value}`)
  const connectionLabel = computed(() => `Connection status. API: ${apiStateLabel(apiStatus.value)}. Realtime: ${socketStateLabel(socketStatus.value)}.`)
  const connectionTooltip = computed(() => html`
    <span class="echo-status-tooltip">
      <strong class="echo-status-tooltip-title">Connection status</strong>
      <span class="echo-status-tooltip-row">
        <span class="echo-status-tooltip-service"><span class="echo-status-tooltip-led is-api is-${apiTone.value}" aria-hidden="true" />API</span>
        <strong class="echo-status-tooltip-value is-api is-${apiTone.value}">${apiStateLabel(apiStatus.value)}</strong>
      </span>
      <span class="echo-status-tooltip-description">Posts, profiles, and settings</span>
      <span class="echo-status-tooltip-row">
        <span class="echo-status-tooltip-service"><span class="echo-status-tooltip-led is-socket is-${socketTone.value}" aria-hidden="true" />Realtime</span>
        <strong class="echo-status-tooltip-value is-socket is-${socketTone.value}">${socketStateLabel(socketStatus.value)}</strong>
      </span>
      <span class="echo-status-tooltip-description">Live messages and notifications</span>
    </span>
  `)

  return (
    <div class="echo-header-status" aria-label="Echo connection status">
      {Tooltip({
        content: connectionTooltip,
        children: (
          <span class={connectionClass} tabIndex="0" aria-label={connectionLabel}>
            <span class="echo-header-status-led" aria-hidden="true" />
            <span class="sr-only">Connection status</span>
          </span>
        )
      })}
    </div>
  )
}
