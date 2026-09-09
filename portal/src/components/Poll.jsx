import { computed, signal } from '../lib/vendor.js'
import { Button, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

export function Poll({ postId, poll }) {
  const current = signal(poll)
  const busy = signal(false)
  const error = signal('')

  async function vote(optionId) {
    if (busy.value || current.value.viewerOptionId) return
    busy.value = true
    error.value = ''
    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(postId)}/poll/vote`, {
        method: 'PUT',
        body: JSON.stringify({ optionId })
      })
      current.value = result.data.poll
    } catch (requestError) {
      error.value = requestError.message || 'Could not record vote'
    } finally {
      busy.value = false
    }
  }

  const options = computed(() => current.value.options || [])
  const totalVotes = computed(() => Number(current.value.totalVotes || 0))
  const resultsHidden = computed(() => Boolean(current.value.hideResultsUntilVoted) && !current.value.viewerOptionId)
  const voteSummary = computed(() => {
    if (resultsHidden.value) return 'Vote to see results'
    return `${totalVotes.value} ${totalVotes.value === 1 ? 'vote' : 'votes'}`
  })

  return (
    <div class="post-poll">
      <Label size="small" tone="accent">POLL</Label>
      <strong>{current.value.question}</strong>
      <div class="post-poll-options" role="group" aria-label={current.value.question}>
        {options.value.map(option => {
          const percentage = totalVotes.value ? Math.round(option.votes / totalVotes.value * 100) : 0
          const selected = current.value.viewerOptionId === option.id
          return (
            <Button
              key={option.id}
              type="button"
              variant={selected ? 'secondary' : 'tertiary'}
              size="small"
              class="post-poll-option"
              loading={busy}
              pressed={selected}
              ariaLabel={resultsHidden.value ? `${option.label} — vote to reveal results` : `${option.label} — ${percentage}% · ${option.votes}`}
              onClick={() => vote(option.id)}
            >
              <span>{option.label}</span>
              <span>{resultsHidden.value ? 'Vote to reveal' : `${percentage}% · ${option.votes}`}</span>
            </Button>
          )
        })}
      </div>
      <small>{voteSummary.value}{current.value.expiresAt ? ` · closes ${new Date(current.value.expiresAt).toLocaleDateString()}` : ''}</small>
      <div class="post-feed-error" role="alert">{error}</div>
    </div>
  )
}
