import { computed, signal } from '../lib/vendor.js'
import { Button } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function ProfileRelationshipControls({ user, onChanged }) {
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

  return (
    <div class="profile-relationship-controls">
      <Button
        variant="tertiary"
        size="small"
        loading={computed(() => busy.value === 'mute')}
        pressed={computed(() => state.value.mutedByViewer)}
        onClick={() => toggle('mute', state.value.mutedByViewer)}
      >
        {computed(() => state.value.mutedByViewer ? 'Unmute' : 'Mute')}
      </Button>
      <Button
        variant="tertiary"
        size="small"
        loading={computed(() => busy.value === 'restrict')}
        pressed={computed(() => state.value.restrictedByViewer)}
        onClick={() => toggle('restrict', state.value.restrictedByViewer)}
      >
        {computed(() => state.value.restrictedByViewer ? 'Unrestrict' : 'Restrict')}
      </Button>
      <Button
        variant="tertiary"
        size="small"
        loading={computed(() => busy.value === 'block')}
        pressed={computed(() => state.value.blockedByViewer)}
        onClick={() => toggle('block', state.value.blockedByViewer)}
      >
        {computed(() => state.value.blockedByViewer ? 'Unblock' : 'Block')}
      </Button>
      <span class="profile-relationship-error" role="alert">{error}</span>
    </div>
  )
}
