import { signal } from '../lib/vendor.js'
import { Button, Card } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { ReportButton } from './ReportButton.jsx'
import { AppealButton } from './AppealButton.jsx'
import { formatClockTime } from '../lib/dates.js'

export function ChatMessage({ message, currentUserId, onUpdated, onDeleted }) {
  const editing = signal(false)
  const body = signal(message.body || '')
  const busy = signal(false)
  const error = signal('')
  const own = message.sender.id === currentUserId

  async function save() {
    busy.value = true
    try {
      const result = await apiRequest(`/api/chat/messages/${encodeURIComponent(message.id)}`, {
        method: 'PATCH', body: JSON.stringify({ body: body.value })
      })
      editing.value = false
      onUpdated(result.data.message)
    } catch (requestError) {
      error.value = requestError.message || 'Could not edit message'
    } finally {
      busy.value = false
    }
  }

  async function remove() {
    busy.value = true
    try {
      const result = await apiRequest(`/api/chat/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' })
      onDeleted(result.data.message)
    } catch (requestError) {
      error.value = requestError.message || 'Could not delete message'
    } finally {
      busy.value = false
    }
  }

  return (
    <div class="chat-message-keyboard-item" role="group" tabIndex={0} data-keyboard-item="true" aria-label={`Message from ${message.sender.displayName}`}>
      <Card class={own ? 'chat-message chat-message-own' : 'chat-message'}>
      <div class="chat-message-meta">
        <strong>{message.sender.displayName}</strong>
        <time datetime={message.createdAt}>{formatClockTime(message.createdAt)}</time>
      </div>
      {message.deletedAt
        ? <p class="chat-message-deleted">Message deleted</p>
        : editing.value
          ? <textarea class="chat-edit-input" use:bind={body} maxlength="4000" rows="3" />
          : <p>{message.body}</p>}
      {message.editedAt && !message.deletedAt && <small>edited</small>}
      {message.moderationStatus === 'flagged' && <small class="chat-message-moderation">Flagged for review</small>}
      {message.moderationStatus === 'hidden' && <small class="chat-message-moderation">Hidden by moderation</small>}
      {message.moderationStatus === 'appeal_pending' && <small class="chat-message-moderation">Appeal pending</small>}
      {message.moderationStatus === 'appeal_accepted' && <small class="chat-message-moderation">Appeal accepted</small>}
      {message.moderationStatus === 'appeal_rejected' && <small class="chat-message-moderation">Appeal rejected</small>}
      <small>{message.readBy.length ? `Read by ${message.readBy.map(reader => `@${reader.username}`).join(', ')}` : ''}</small>
      {!message.deletedAt && (
        <div class="chat-message-actions">
          {own && !editing.value && <Button variant="tertiary" size="small" onClick={() => editing.value = true}>Edit</Button>}
          {own && editing.value && <Button size="small" loading={busy} onClick={save}>Save</Button>}
          {own && editing.value && <Button variant="tertiary" size="small" onClick={() => editing.value = false}>Cancel</Button>}
          {own && <Button variant="tertiary" size="small" loading={busy} onClick={remove}>Delete</Button>}
          {!own && <ReportButton targetType="message" targetId={message.id} />}
          {own && ['hidden', 'appeal_rejected'].includes(message.moderationStatus) && <AppealButton targetType="message" targetId={message.id} />}
        </div>
      )}
      <div class="chat-message-error" role="status">{error}</div>
      </Card>
    </div>
  )
}
