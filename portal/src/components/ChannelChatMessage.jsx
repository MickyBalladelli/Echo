import { signal } from '../lib/vendor.js'
import { Button } from '../lib/vendor.js'
import { formatClockTime } from '../lib/dates.js'
import { UserAvatar } from './UserAvatar.jsx'

export function ChannelChatMessage({ message, currentUserId, compact = false, onReply }) {
  const copied = signal(false)
  const reactionPickerOpen = signal(false)
  const selectedReaction = signal('')
  const own = message.sender.id === currentUserId
  let copyTimer

  async function copyMessage() {
    try {
      const copyText = [message.body, ...(message.attachments || []).map(attachment => attachment.name)]
        .filter(Boolean)
        .join('\n')
      await navigator.clipboard.writeText(copyText)
      copied.value = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => copied.value = false, 1400)
    } catch {
      copied.value = false
    }
  }

  function toggleReaction(emoji) {
    selectedReaction.value = selectedReaction.value === emoji ? '' : emoji
    reactionPickerOpen.value = false
  }

  function openAttachment(event, attachment) {
    event.preventDefault()
    window.open(attachment.data, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      class={`channel-chat-message-row ${compact ? 'channel-chat-message-compact' : ''} ${own ? 'channel-chat-message-own' : ''}`}
      role="group"
      tabIndex={0}
      data-keyboard-item="true"
      aria-label={`Message from ${message.sender.displayName}`}
    >
      {compact
        ? <span class="channel-chat-message-avatar-spacer" aria-hidden="true" />
        : <UserAvatar user={message.sender} size="large" className="channel-chat-message-avatar" />}
      <div class="channel-chat-message-body">
        {!compact && (
          <div class="channel-chat-message-meta">
            <strong>{message.sender.displayName}</strong>
            <span class="channel-chat-message-badge" aria-hidden="true">🎈</span>
            <time datetime={message.createdAt}>{formatClockTime(message.createdAt)}</time>
          </div>
        )}
        {message.body && <p>{message.body}</p>}
        {message.attachments?.length > 0 && (
          <div class="channel-chat-message-attachments" aria-label="Message attachments">
            {message.attachments.map(attachment => (
              <a
                key={`${attachment.name}-${attachment.size}`}
                class="channel-chat-message-attachment"
                href="#"
                title={`Open ${attachment.name}`}
                aria-label={`Open ${attachment.name}`}
                onClick={event => openAttachment(event, attachment)}
              >
                <span class="channel-chat-attachment-icon" aria-hidden="true">📎︎</span>
                <span>{attachment.name}</span>
              </a>
            ))}
          </div>
        )}
        {message.updatedAt !== message.createdAt && <small class="channel-chat-message-edited">(edited)</small>}
        {selectedReaction.value && (
          <div class="channel-chat-message-reactions">
            <button
              class="channel-chat-reaction"
              type="button"
              aria-label={`Remove ${selectedReaction.value} reaction`}
              onClick={() => toggleReaction(selectedReaction.value)}
            >
              <span aria-hidden="true">{selectedReaction.value}</span>
              <b>1</b>
            </button>
          </div>
        )}
        <div class="channel-chat-message-actions">
          {reactionPickerOpen.value && (
            <div class="channel-chat-reaction-picker" role="group" aria-label="Choose a reaction">
              {['🔥', '🙂', '❤️', '👏'].map(emoji => (
                <button
                  key={emoji}
                  class="channel-chat-reaction-option"
                  type="button"
                  aria-label={`React with ${emoji}`}
                  onClick={() => toggleReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <Button variant="tertiary" size="small" onClick={() => reactionPickerOpen.value = !reactionPickerOpen.value}>React</Button>
          <Button variant="tertiary" size="small" onClick={() => onReply?.(message)}>Reply</Button>
          <Button variant="tertiary" size="small" onClick={copyMessage}>Copy</Button>
          {copied.value && <span class="channel-chat-message-copied" role="status">Copied</span>}
        </div>
      </div>
    </div>
  )
}
