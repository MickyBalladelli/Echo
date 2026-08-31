import { signal } from '../lib/vendor.js'
import { Button } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function ReportButton({ targetType, targetId, label = 'Report' }) {
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
      await apiRequest('/api/moderation/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          targetId,
          reason: reason.value.trim() || `Reported ${targetType} for safety review`
        })
      })
      result.value = 'Reported for review.'
      open.value = false
      reason.value = ''
    } catch (requestError) {
      error.value = requestError.message || 'Could not send report'
    } finally {
      busy.value = false
    }
  }

  return (
    <span class="moderation-action">
      {!result.value && <Button variant="tertiary" size="small" onClick={() => open.value = !open.value}>{open.value ? 'Cancel' : label}</Button>}
      {result.value && <span class="moderation-action-result">{result.value}</span>}
      {open.value && (
        <form class="moderation-action-form" onSubmit={submit}>
          <textarea use:bind={reason} maxlength="500" rows="2" placeholder="Why should we review this?" aria-label={`Reason for reporting ${targetType}`} />
          <Button type="submit" size="small" loading={busy}>Send report</Button>
        </form>
      )}
      {error.value && <span class="moderation-action-error" role="alert">{error.value}</span>}
    </span>
  )
}
