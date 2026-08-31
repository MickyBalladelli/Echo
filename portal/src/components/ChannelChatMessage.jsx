import { signal } from '../lib/vendor.js'
import { Button } from '../lib/vendor.js'
import { formatClockTime } from '../lib/dates.js'
import { UserAvatar } from './UserAvatar.jsx'

export function ChannelChatMessage({ message, currentUserId, compact = false, onReply }) {
  const copied = signal(false)
  const own = message.sender.id === currentUserId
  let copyTimer

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.body)
      copied.value = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => copied.value = false, 1400)
    } catch {
      copied.value = false
    }
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
        : <UserAvatar user={message.sender} size="medium" className="channel-chat-message-avatar" />}
      <div class="channel-chat-message-body">
        {!compact && (
          <div class="channel-chat-message-meta">
            <strong>{message.sender.displayName}</strong>
            <span>@{message.sender.username}</span>
            <time datetime={message.createdAt}>{formatClockTime(message.createdAt)}</time>
          </div>
        )}
        <p>{message.body}</p>
        {message.updatedAt !== message.createdAt && <small class="channel-chat-message-edited">(edited)</small>}
        <div class="channel-chat-message-actions">
          <Button variant="tertiary" size="small" onClick={() => onReply?.(message)}>Reply</Button>
          <Button variant="tertiary" size="small" onClick={copyMessage}>Copy</Button>
          {copied.value && <span class="channel-chat-message-copied" role="status">Copied</span>}
        </div>
      </div>
    </div>
  )
}
