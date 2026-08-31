import { signal } from '../lib/vendor.js'
import { Button } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function AppealButton({ targetType, targetId }) {
  const open = signal(false)
  const reason = signal('')
  const busy = signal(false)
  const result = signal('')
  const error = signal('')

  async function submit(event) {
    event.preventDefault()
    busy.value = true
    error.value = ''
    try {
      await apiRequest('/api/moderation/appeals', {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          targetId,
          reason: reason.value.trim() || 'I believe this moderation action should be reviewed'
        })
      })
      result.value = 'Appeal submitted.'
      open.value = false
      reason.value = ''
    } catch (requestError) {
      error.value = requestError.message || 'Could not submit appeal'
    } finally {
      busy.value = false
    }
  }

  function closeOnEscape(event) {
    if (event.key === 'Escape') open.value = false
  }

  return (
    <span class="moderation-action">
      {!result.value && <Button variant="tertiary" size="small" onClick={() => open.value = !open.value}>{open.value ? 'Cancel appeal' : 'Appeal'}</Button>}
      {result.value && <span class="moderation-action-result">{result.value}</span>}
      {open.value && (
        <form class="moderation-action-form" role="dialog" aria-label={`Appeal ${targetType}`} onSubmit={submit} onKeyDown={closeOnEscape}>
          <textarea use:bind={reason} maxlength="500" rows="2" placeholder="Tell moderators why this should return." aria-label={`Reason for appealing ${targetType}`} />
          <Button type="submit" size="small" loading={busy}>Send appeal</Button>
        </form>
      )}
      {error.value && <span class="moderation-action-error" role="alert">{error.value}</span>}
    </span>
  )
}
