import { computed, signal } from '../lib/vendor.js'
import { Button, CloseIcon, EyeOffIcon, IconButton, LockIcon } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function ProfileRelationshipControls({ user, onChanged, compact = false }) {
  const state = signal({
    mutedByViewer: Boolean(user.mutedByViewer),
    restrictedByViewer: Boolean(user.restrictedByViewer),
    blockedByViewer: Boolean(user.blockedByViewer)
  })
  const busy = signal('')
  const error = signal('')

  async function toggle(kind, active) {
    busy.value = kind
    error.value = ''
    try {
      const result = await apiRequest(`/api/users/${encodeURIComponent(user.id)}/${kind}`, {
        method: active ? 'DELETE' : 'PUT'
      })
      const next = result.data.relationship
      state.value = {
        mutedByViewer: next.mutedByViewer,
        restrictedByViewer: next.restrictedByViewer,
        blockedByViewer: next.blockedByViewer
      }
      onChanged?.(next)
    } catch (requestError) {
      error.value = requestError.message || 'Could not update relationship'
    } finally {
      busy.value = ''
    }
  }

  function renderControl({ kind, label, active, icon }) {
    const currentLabel = computed(() => active.value ? `Un${label.toLowerCase()}` : label)
    const props = {
      size: 'small',
      title: currentLabel,
      ariaLabel: computed(() => `${currentLabel.value} this user`),
      loading: computed(() => busy.value === kind),
      pressed: active,
      onClick: () => toggle(kind, active.value)
    }

    if (compact) {
      return <IconButton {...props} class={`profile-relationship-icon profile-relationship-icon-${kind}`} icon={icon} />
    }

    return <Button {...props} variant="tertiary">{currentLabel}</Button>
  }

  return (
    <div class="profile-relationship-controls">
      {renderControl({
        kind: 'mute',
        label: 'Mute',
        active: computed(() => state.value.mutedByViewer),
        icon: EyeOffIcon({ size: '1.1em' })
      })}
      {renderControl({
        kind: 'restrict',
        label: 'Restrict',
        active: computed(() => state.value.restrictedByViewer),
        icon: LockIcon({ size: '1.1em' })
      })}
      {renderControl({
        kind: 'block',
        label: 'Block',
        active: computed(() => state.value.blockedByViewer),
        icon: CloseIcon({ size: '1.1em' })
      })}
      <span class="profile-relationship-error" role="alert">{error}</span>
    </div>
  )
}
