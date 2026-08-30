import { signal } from '../lib/vendor.js'
import { Button, Card } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'

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

  async function report() {
    busy.value = true
    try {
      await apiRequest(`/api/chat/messages/${encodeURIComponent(message.id)}/reports`, {
        method: 'POST', body: JSON.stringify({ reason: 'Reported from chat conversation' })
      })
      error.value = 'Reported for review.'
    } catch (requestError) {
      error.value = requestError.message || 'Could not report message'
    } finally {
      busy.value = false
    }
  }

  return (
    <Card class={own ? 'chat-message chat-message-own' : 'chat-message'}>
      <div class="chat-message-meta">
        <strong>{message.sender.displayName}</strong>
        <time datetime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      {message.deletedAt
        ? <p class="chat-message-deleted">Message deleted</p>
        : editing.value
          ? <textarea class="chat-edit-input" use:bind={body} maxlength="4000" rows="3" />
          : <p>{message.body}</p>}
      {message.editedAt && !message.deletedAt && <small>edited</small>}
      <small>{message.readBy.length ? `Read by ${message.readBy.map(reader => `@${reader.username}`).join(', ')}` : ''}</small>
      {!message.deletedAt && (
        <div class="chat-message-actions">
          {own && !editing.value && <Button variant="tertiary" size="small" onClick={() => editing.value = true}>Edit</Button>}
          {own && editing.value && <Button size="small" loading={busy} onClick={save}>Save</Button>}
          {own && editing.value && <Button variant="tertiary" size="small" onClick={() => editing.value = false}>Cancel</Button>}
          {own && <Button variant="tertiary" size="small" loading={busy} onClick={remove}>Delete</Button>}
          {!own && <Button variant="tertiary" size="small" loading={busy} onClick={report}>Report</Button>}
        </div>
      )}
      <div class="chat-message-error" role="status">{error}</div>
    </Card>
  )
}
