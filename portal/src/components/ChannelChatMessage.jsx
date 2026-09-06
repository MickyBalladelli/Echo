import { computed, signal } from '../lib/vendor.js'
import { Badge, ChatIcon, CopyIcon, IconButton } from '../lib/vendor.js'
import { formatClockTime } from '../lib/dates.js'
import { UserAvatar } from './UserAvatar.jsx'
import { MentionProfilePopover } from './MentionProfilePopover.jsx'
import { ChannelReactionPicker } from './ChannelReactionPicker.jsx'

function mentionsUsername(body, username) {
  if (!body || !username) return false
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9_])@${escapedUsername}(?![a-z0-9_])`, 'i').test(body)
}

function renderBody(body, router, members) {
  return String(body).split(/(@[a-z0-9_]{3,32})/gi).map((part, index) => /^@[a-z0-9_]{3,32}$/i.test(part)
    ? <MentionProfilePopover
      key={`${part}-${index}`}
      username={part.slice(1).toLowerCase()}
      previewUser={members.find(member => member.username?.toLowerCase() === part.slice(1).toLowerCase())}
      router={router}
    >{part}</MentionProfilePopover>
    : part)
}

export function ChannelChatMessage({ message, currentUserId, currentUsername, compact = false, onReply, channelRole, members = [], router }) {
  const copied = signal(false)
  const reactionPickerOpen = signal(false)
  const reactionPickerPosition = signal(null)
  const selectedReaction = signal(null)
  const own = message.sender.id === currentUserId
  const mentioned = mentionsUsername(message.body, currentUsername)
  const roleLabel = channelRole === 'owner' ? 'Owner' : channelRole === 'moderator' ? 'Moderator' : ''
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

  function toggleReaction(reaction) {
    selectedReaction.value = selectedReaction.value?.value === reaction.value ? null : reaction
    closeReactionPicker()
  }

  function closeReactionPicker() {
    reactionPickerOpen.value = false
    reactionPickerPosition.value = null
  }

  function toggleReactionPicker(event) {
    if (reactionPickerOpen.value) {
      closeReactionPicker()
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const popupWidth = Math.min(360, window.innerWidth - 32)
    const popupHeight = Math.min(480, window.innerHeight * 0.7)
    const top = rect.top >= popupHeight + 20
      ? rect.top - popupHeight - 8
      : Math.min(window.innerHeight - popupHeight - 12, rect.bottom + 8)
    const left = Math.min(window.innerWidth - popupWidth - 12, Math.max(12, rect.right - popupWidth))

    reactionPickerPosition.value = { top: Math.max(12, top), left }
    reactionPickerOpen.value = true
  }

  const selectedReactionView = computed(() => {
    const reaction = selectedReaction.value
    if (!reaction) return null

    return (
      <div class="channel-chat-message-reactions">
        <button
          class="channel-chat-reaction"
          type="button"
          aria-label={`Remove ${reaction.label} reaction`}
          onClick={() => toggleReaction(reaction)}
        >
          {reaction.type === 'gif'
            ? <img src={reaction.value} alt={reaction.label} />
            : <span aria-hidden="true">{reaction.value}</span>}
          <b>1</b>
        </button>
      </div>
    )
  })

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
      aria-label={`Message from ${message.sender.displayName}${roleLabel ? `, ${roleLabel}` : ''}`}
    >
      {compact
        ? <span class="channel-chat-message-avatar-spacer" aria-hidden="true" />
        : <UserAvatar user={message.sender} size="large" className="channel-chat-message-avatar" />}
      <div class="channel-chat-message-body">
        {!compact && (
          <div class="channel-chat-message-meta">
            <strong>{message.sender.displayName}</strong>
            <span class="channel-chat-message-badge" aria-hidden="true">🎈</span>
            {roleLabel && <Badge tone={channelRole === 'owner' ? 'accent' : 'success'} size="small">{roleLabel}</Badge>}
            {mentioned && <span class="channel-chat-mention-label">Mentioned you</span>}
            <time datetime={message.createdAt}>{formatClockTime(message.createdAt)}</time>
          </div>
        )}
        {message.body && <p>{renderBody(message.body, router, members)}</p>}
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
        {selectedReactionView}
        <div class="channel-chat-message-actions">
          <IconButton
            class="channel-chat-react-button"
            variant="tertiary"
            size="small"
            icon="😀"
            ariaLabel="Open reactions"
            title="Reactions"
            onClick={toggleReactionPicker}
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
      <ChannelReactionPicker open={reactionPickerOpen} position={reactionPickerPosition} onSelect={toggleReaction} onClose={closeReactionPicker} />
    </div>
  )
}
