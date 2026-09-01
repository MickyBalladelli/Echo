import { signal } from '../lib/vendor.js'
import { ChatIcon, CopyIcon, IconButton, SparkIcon } from '../lib/vendor.js'
import { formatClockTime } from '../lib/dates.js'
import { UserAvatar } from './UserAvatar.jsx'

function mentionsUsername(body, username) {
  if (!body || !username) return false
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9_])@${escapedUsername}(?![a-z0-9_])`, 'i').test(body)
}

function renderBody(body) {
  return String(body).split(/(@[a-z0-9_]{3,32})/gi).map((part, index) => /^@[a-z0-9_]{3,32}$/i.test(part)
    ? <span key={`${part}-${index}`} class="channel-chat-mention">{part}</span>
    : part)
}

export function ChannelChatMessage({ message, currentUserId, currentUsername, compact = false, onReply }) {
  const copied = signal(false)
  const reactionPickerOpen = signal(false)
  const selectedReaction = signal('')
  const own = message.sender.id === currentUserId
  const mentioned = !own && mentionsUsername(message.body, currentUsername)
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

  function attachmentBlob(attachment) {
    const encoded = attachment.data.split(',')[1] || ''
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    return new Blob([bytes], { type: attachment.type || 'application/octet-stream' })
  }

  function openAttachment(event, attachment) {
    event.preventDefault()
    const url = URL.createObjectURL(attachmentBlob(attachment))
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  function downloadAttachment(event, attachment) {
    event.preventDefault()
    const url = URL.createObjectURL(attachmentBlob(attachment))
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div
      class={`channel-chat-message-row ${compact ? 'channel-chat-message-compact' : ''} ${own ? 'channel-chat-message-own' : ''} ${mentioned ? 'channel-chat-message-mentioned' : ''}`}
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
            {mentioned && <span class="channel-chat-mention-label">Mentioned you</span>}
            <time datetime={message.createdAt}>{formatClockTime(message.createdAt)}</time>
          </div>
        )}
        {message.body && <p>{renderBody(message.body)}</p>}
        {message.attachments?.length > 0 && (
          <div class="channel-chat-message-attachments" aria-label="Message attachments">
            {message.attachments.map(attachment => (
              <div class="channel-chat-message-attachment-group" key={`${attachment.name}-${attachment.size}`}>
                <a
                  class="channel-chat-message-attachment"
                  href="#"
                  title={`Open ${attachment.name}`}
                  aria-label={`Open ${attachment.name}`}
                  onClick={event => openAttachment(event, attachment)}
                >
                  <span class="channel-chat-attachment-icon" aria-hidden="true">📎︎</span>
                  <span>{attachment.name}</span>
                </a>
                <button
                  type="button"
                  class="channel-chat-message-attachment-download"
                  title={`Download ${attachment.name}`}
                  aria-label={`Download ${attachment.name}`}
                  onClick={event => downloadAttachment(event, attachment)}
                >
                  Download
                </button>
              </div>
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
          <IconButton
            variant="tertiary"
            size="small"
            icon={SparkIcon()}
            ariaLabel="React to message"
            title="React"
            onClick={() => reactionPickerOpen.value = !reactionPickerOpen.value}
          />
          <IconButton
            variant="tertiary"
            size="small"
            icon={ChatIcon()}
            ariaLabel="Reply to message"
            title="Reply"
            onClick={() => onReply?.(message)}
          />
          <IconButton
            variant="tertiary"
            size="small"
            icon={CopyIcon()}
            ariaLabel="Copy message"
            title="Copy"
            onClick={copyMessage}
          />
          {copied.value && <span class="channel-chat-message-copied" role="status">Copied</span>}
        </div>
      </div>
    </div>
  )
}
