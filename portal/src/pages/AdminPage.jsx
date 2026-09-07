import { computed, onMount, signal } from '../lib/vendor.js'
import { Badge, Button, Card, EmptyState, Label, Select } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { formatDateTime } from '../lib/dates.js'
import { PageFrame } from './PageFrame.jsx'

const roleOptions = [
  { value: 'user', label: 'User' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
  { value: 'developer', label: 'Developer' }
]

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' }
]

function roleTone(role) {
  if (role === 'admin' || role === 'developer') return 'accent'
  if (role === 'moderator') return 'success'
  return 'neutral'
}

export function AdminPage({ user }) {
  const isDeveloper = user.role === 'developer'
  const isAdmin = ['admin', 'developer'].includes(user.role)
  const users = signal([])
  const state = signal('loading')
  const error = signal('')
  const busy = signal('')
  const roleValues = new Map()
  const statusValues = new Map()

  function fieldValue(values, target, field) {
    let value = values.get(target.id)
    if (!value) {
      value = signal(target[field])
      values.set(target.id, value)
    }
    return value
  }

  async function load() {
    state.value = 'loading'
    error.value = ''
    try {
      const result = await apiRequest('/api/admin/users')
      users.value = result.data.users
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load admin users'
      state.value = 'error'
    }
  }

  async function updateRole(target, role) {
    if (role === target.role) return
    busy.value = `role:${target.id}`
    error.value = ''
    try {
      const result = await apiRequest(`/api/admin/users/${encodeURIComponent(target.id)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      })
      roleValues.get(target.id).value = result.data.user.role
      users.value = users.value.map(item => item.id === target.id ? result.data.user : item)
    } catch (requestError) {
      roleValues.get(target.id).value = target.role
      error.value = requestError.message || 'Could not update user role'
    } finally {
      busy.value = ''
    }
  }

  async function updateStatus(target, status) {
    if (status === target.status) return
    busy.value = `status:${target.id}`
    error.value = ''
    try {
      const result = await apiRequest(`/api/admin/users/${encodeURIComponent(target.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      statusValues.get(target.id).value = result.data.user.status
      users.value = users.value.map(item => item.id === target.id ? result.data.user : item)
    } catch (requestError) {
      statusValues.get(target.id).value = target.status
      error.value = requestError.message || 'Could not update account status'
    } finally {
      busy.value = ''
    }
  }

  const content = computed(() => {
    if (!isAdmin) {
      return <Card><EmptyState status="error" title="Admin access required" description="Only admins and developers can manage Echo accounts." /></Card>
    }
    if (state.value === 'loading') return <Card><div role="status">Loading admin section…</div></Card>
    if (state.value === 'error') {
      return <Card><EmptyState status="error" title="Admin section unavailable" description={error.value} action={Button({ children: 'Try again', onClick: load })} /></Card>
    }

    const admins = users.value.filter(item => item.role === 'admin').length
    const moderators = users.value.filter(item => item.role === 'moderator').length
    const developers = users.value.filter(item => item.role === 'developer').length
    const suspended = users.value.filter(item => item.status === 'suspended').length

    return (
      <div class="admin-page-stack">
        <Card class="admin-summary-card">
          <div class="admin-section-heading">
            <Label size="small" tone="accent">ADMIN / OVERVIEW</Label>
            <h2>Manage Echo</h2>
            <p>Control global roles and account access.</p>
          </div>
          <div class="admin-summary-grid">
            <div><strong>{users.value.length}</strong><span>Accounts</span></div>
            <div><strong>{admins}</strong><span>Admins</span></div>
            <div><strong>{moderators}</strong><span>Moderators</span></div>
            <div><strong>{developers}</strong><span>Developers</span></div>
            <div><strong>{suspended}</strong><span>Suspended</span></div>
          </div>
        </Card>

        <Card class="admin-users-card">
          <div class="admin-section-heading">
            <Label size="small" tone="accent">USERS</Label>
            <h2>Account access</h2>
            <p>Change a user role or suspend an account. Developer access can only be removed by another developer.</p>
          </div>
          {!users.value.length
            ? <EmptyState title="No users found" description="Echo has no accounts yet." />
            : <div class="admin-user-list">{users.value.map(target => {
              const isSelf = target.id === user.id
              const developerLocked = target.role === 'developer' && !isDeveloper
              const roleBusy = busy.value === `role:${target.id}`
              const statusBusy = busy.value === `status:${target.id}`
              const roleValue = fieldValue(roleValues, target, 'role')
              const statusValue = fieldValue(statusValues, target, 'status')
              return (
                <div key={target.id} class="admin-user-row">
                  <div class="admin-user-copy">
                    <strong>{target.displayName}</strong>
                    <span>@{target.username} · {target.email}</span>
                    <small>Joined {formatDateTime(target.createdAt)}{isSelf ? ' · You' : ''}{developerLocked ? ' · Protected' : ''}</small>
                  </div>
                  <Badge tone={roleTone(target.role)}>{target.role}</Badge>
                  <div class="admin-user-controls">
                    <div class="admin-user-control">
                      <span>Role</span>
                      <Select
                        id={`admin-role-${target.id}`}
                        value={roleValue}
                        ariaLabel={`Role for @${target.username}`}
                        options={roleOptions}
                        disabled={isSelf || developerLocked || roleBusy || statusBusy}
                        onChange={() => updateRole(target, roleValue.value)}
                      />
                    </div>
                    <div class="admin-user-control">
                      <span>Status</span>
                      <Select
                        id={`admin-status-${target.id}`}
                        value={statusValue}
                        ariaLabel={`Status for @${target.username}`}
                        options={statusOptions}
                        disabled={isSelf || developerLocked || roleBusy || statusBusy}
                        onChange={() => updateStatus(target, statusValue.value)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}</div>}
          <div class="admin-page-error" role="alert">{error.value}</div>
        </Card>
      </div>
    )
  })

  onMount(() => {
    if (isAdmin) load()
  })

  return (
    <PageFrame
      eyebrow="ADMIN / CONTROL"
      title="Admin"
      description="Manage Echo accounts, roles, and access."
      hideHeader
    >
      {content}
    </PageFrame>
  )
}
