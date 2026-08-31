import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

function targetLabel(item) {
  return `${item.targetType} · ${item.target.preview}`
}

export function ModerationQueue() {
  const reports = signal([])
  const appeals = signal([])
  const state = signal('loading')
  const error = signal('')
  const busy = signal('')

  async function load() {
    state.value = 'loading'
    error.value = ''
    try {
      const [reportResult, appealResult] = await Promise.all([
        apiRequest('/api/moderation/queue?limit=100'),
        apiRequest('/api/moderation/appeals?limit=100')
      ])
      reports.value = reportResult.data.reports
      appeals.value = appealResult.data.appeals
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load moderation queue'
      state.value = 'error'
    }
  }

  async function reviewReport(report, action) {
    busy.value = `report:${report.id}`
    error.value = ''
    try {
      await apiRequest(`/api/moderation/reports/${encodeURIComponent(report.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, note: '' })
      })
      reports.value = reports.value.filter(item => item.id !== report.id)
    } catch (requestError) {
      error.value = requestError.message || 'Could not review report'
    } finally {
      busy.value = ''
    }
  }

  async function reviewAppeal(appeal, decision) {
    busy.value = `appeal:${appeal.id}`
    error.value = ''
    try {
      await apiRequest(`/api/moderation/appeals/${encodeURIComponent(appeal.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, note: '' })
      })
      appeals.value = appeals.value.filter(item => item.id !== appeal.id)
    } catch (requestError) {
      error.value = requestError.message || 'Could not review appeal'
    } finally {
      busy.value = ''
    }
  }

  const content = computed(() => {
    if (state.value === 'loading') return <Card><div role="status">Loading moderation queue…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Queue unavailable" description={error.value} action={Button({ children: 'Try again', onClick: load })} /></Card>

    return (
      <div class="moderation-queue-stack">
        <Card class="moderation-queue-card">
          <div class="moderation-queue-heading">
            <div><Label size="small" tone="accent">REPORTS</Label><p>Review posts, users, channels, and messages.</p></div>
            <span>{reports.value.length} open</span>
          </div>
          {!reports.value.length
            ? <EmptyState title="No open reports" description="The queue is clear." />
            : <div class="moderation-item-list">{reports.value.map(report => (
              <div class="moderation-item" key={report.id}>
                <div class="moderation-item-copy">
                  <strong>{targetLabel(report)}</strong>
                  <span>{report.reason}</span>
                  <small>Reported by @{report.reporter.username} · {new Date(report.createdAt).toLocaleString()}</small>
                </div>
                <div class="moderation-item-actions">
                  {['removed', 'hidden', 'suspended'].includes(report.target.status)
                    ? <Button variant="secondary" size="small" loading={busy.value === `report:${report.id}`} onClick={() => reviewReport(report, 'restore')}>Restore</Button>
                    : <Button variant="secondary" size="small" loading={busy.value === `report:${report.id}`} onClick={() => reviewReport(report, 'remove')}>Remove</Button>}
                  <Button variant="tertiary" size="small" loading={busy.value === `report:${report.id}`} onClick={() => reviewReport(report, 'dismiss')}>Dismiss</Button>
                </div>
              </div>
            ))}</div>}
        </Card>
        <Card class="moderation-queue-card">
          <div class="moderation-queue-heading">
            <div><Label size="small" tone="accent">APPEALS</Label><p>Give content owners a second review.</p></div>
            <span>{appeals.value.length} open</span>
          </div>
          {!appeals.value.length
            ? <EmptyState title="No open appeals" description="Nothing needs a second look." />
            : <div class="moderation-item-list">{appeals.value.map(appeal => (
              <div class="moderation-item" key={appeal.id}>
                <div class="moderation-item-copy">
                  <strong>{targetLabel(appeal)}</strong>
                  <span>{appeal.reason}</span>
                  <small>Appeal by @{appeal.appellant.username} · {new Date(appeal.createdAt).toLocaleString()}</small>
                </div>
                <div class="moderation-item-actions">
                  <Button size="small" loading={busy.value === `appeal:${appeal.id}`} onClick={() => reviewAppeal(appeal, 'accept')}>Accept</Button>
                  <Button variant="tertiary" size="small" loading={busy.value === `appeal:${appeal.id}`} onClick={() => reviewAppeal(appeal, 'reject')}>Reject</Button>
                </div>
              </div>
            ))}</div>}
        </Card>
        <div class="post-feed-error" role="alert">{error}</div>
      </div>
    )
  })

  onMount(load)

  return content
}
