import { computed, effect, html, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, IconButton } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { emitRealtime, onRealtimeEvent } from '../lib/realtime.js'
import { ChannelChatMessage } from './ChannelChatMessage.jsx'
import { KeyboardList } from './KeyboardList.jsx'
import { VirtualList } from './VirtualList.jsx'

const maxAttachmentBytes = 1024 * 1024
const maxAttachmentCount = 3
const maxAttachmentTotalBytes = 1024 * 1024
const chatLoadTimeoutMs = 10000
const paperclipIcon = html`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18.4 12.2 10.7 19.9a4.5 4.5 0 0 1-6.4-6.4l9.2-9.2a3 3 0 0 1 4.2 4.2l-9.2 9.2a1.5 1.5 0 0 1-2.1-2.1l8.5-8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`

export function ChannelChat({ slug, channel, currentUserId }) {
  const readChannel = () => channel?.value ?? channel
  const messages = signal([])
  const body = signal('')
  const attachments = signal([])
  const state = signal('loading')
  const busy = signal(false)
  const error = signal('')

  function messageViewport() {
    if (typeof document === 'undefined') return null
    return document.querySelector('.channel-chat-list .virtual-list')
  }

  function scrollMessagesToBottom() {
    if (typeof requestAnimationFrame !== 'function') return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = messageViewport()
        if (viewport) viewport.scrollTop = viewport.scrollHeight
      })
    })
  }

  function focusMessageInput() {
    if (typeof requestAnimationFrame !== 'function') return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelector('.channel-chat-compose textarea')?.focus()
      })
    })
  }

  function sortMessages(items) {
    return [...items].sort((left, right) => {
      const timeDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      return timeDifference || left.id.localeCompare(right.id)
    })
  }

  function addMessage(message) {
    if (message.channelId !== readChannel().id || messages.value.some(item => item.id === message.id)) return
    const viewport = messageViewport()
    const shouldStickToBottom = !viewport || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
    messages.value = sortMessages([...messages.value, message])
    if (shouldStickToBottom) scrollMessagesToBottom()
    if (message.sender.id !== currentUserId) markRead(message.id)
  }

  function markRead(messageId) {
    apiRequest(`/api/channels/${encodeURIComponent(slug)}/chat/read/${encodeURIComponent(messageId)}`, { method: 'PUT' }).catch(() => {})
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({
        id: `${file.name}-${file.lastModified}-${file.size}-${Math.random()}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: reader.result
      })
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
      reader.readAsDataURL(file)
    })
  }

  async function selectFiles(event) {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    input.value = ''
    if (!files.length) return

    error.value = ''
    const availableSlots = maxAttachmentCount - attachments.value.length
    if (availableSlots <= 0) {
      error.value = `You can attach up to ${maxAttachmentCount} files.`
      return
    }

    let totalBytes = attachments.value.reduce((total, attachment) => total + attachment.size, 0)
    const nextAttachments = []
    for (const file of files.slice(0, availableSlots)) {
      if (file.size > maxAttachmentBytes) {
        error.value = `${file.name} is too large. The limit is 1 MB.`
        continue
      }
      if (totalBytes + file.size > maxAttachmentTotalBytes) {
        error.value = 'Attachments must be 1 MB or smaller in total.'
        continue
      }
      try {
        const attachment = await readFile(file)
        nextAttachments.push(attachment)
        totalBytes += file.size
      } catch (readError) {
        error.value = readError.message || 'Could not read attachment'
      }
    }

    if (files.length > availableSlots) {
      error.value = `You can attach up to ${maxAttachmentCount} files.`
    }
    attachments.value = [...attachments.value, ...nextAttachments]
  }

  function removeAttachment(id) {
    attachments.value = attachments.value.filter(attachment => attachment.id !== id)
  }

  function openAttachmentPicker() {
    if (typeof document === 'undefined') return
    document.getElementById('channel-chat-attachment-input')?.click()
  }

  async function load() {
    if (!readChannel().membershipRole) {
      state.value = 'ready'
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), chatLoadTimeoutMs)
    try {
      const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/chat?limit=50`, {
        signal: controller.signal
      })
      const nextMessages = Array.isArray(result.data)
        ? result.data.filter(message => message?.id && message?.sender?.id)
        : []
      state.value = 'ready'
      const loadedIds = new Set(nextMessages.map(message => message.id))
      messages.value = sortMessages([
        ...nextMessages,
        ...messages.value.filter(message => !loadedIds.has(message.id))
      ])
      const latest = messages.value.at(-1)
      if (latest && latest.sender.id !== currentUserId) markRead(latest.id)
      scrollMessagesToBottom()
    } catch (requestError) {
      error.value = requestError.name === 'AbortError'
        ? 'Chat took too long to load. Try again.'
        : requestError.message || 'Could not load channel chat'
      state.value = 'error'
    } finally {
      clearTimeout(timeout)
    }
  }

  async function send(event) {
    event.preventDefault()
    const cleanBody = body.value.trim()
    if ((!cleanBody && !attachments.value.length) || busy.value) return
    busy.value = true
    error.value = ''
    const attachmentPayload = attachments.value.map(({ id, ...attachment }) => attachment)
    const request = { channelId: readChannel().id, body: cleanBody, attachments: attachmentPayload }
    emitRealtime('channel:chat:message:send', request, async response => {
      if (response.ok) {
        addMessage(response.message)
        body.value = ''
        attachments.value = []
        scrollMessagesToBottom()
      } else if (response.error === 'SOCKET_DISCONNECTED') {
        try {
          const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/chat`, {
            method: 'POST', body: JSON.stringify({ body: cleanBody, attachments: attachmentPayload })
          })
          addMessage(result.data.message)
          body.value = ''
          attachments.value = []
          scrollMessagesToBottom()
        } catch (requestError) {
          error.value = requestError.message || 'Could not send channel message'
        }
      } else {
        error.value = response.message || 'Could not send channel message'
      }
      busy.value = false
      focusMessageInput()
    })
  }

  function replyTo(message) {
    const prefix = `@${message.sender.username} `
    body.value = body.value.trim() ? `${prefix}${body.value}` : prefix
  }

  function handleBodyKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
    event.currentTarget.focus()
  }

  function renderMessage(message, index) {
    const previous = messages.value[index - 1]
    const compact = Boolean(previous && previous.sender.id === message.sender.id &&
      new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000)

    return <ChannelChatMessage message={message} currentUserId={currentUserId} compact={compact} onReply={replyTo} />
  }

  const content = computed(() => {
    if (!readChannel().membershipRole) return <Card><EmptyState title="Join to chat" description="Channel chat is available to members." /></Card>
    if (state.value === 'loading') return <Card><div role="status">Loading channel chat…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Chat unavailable" description={error.value} action={<Button onClick={load}>Try again</Button>} /></Card>
    return <Card class="channel-chat-card">
      <KeyboardList label="Channel chat messages" className="channel-chat-list">
        {messages.value.length
          ? <VirtualList items={messages} estimateSize={72} label="Channel chat history" renderItem={renderMessage} />
          : <div class="channel-chat-empty"><EmptyState title="No messages yet" description="Start the conversation." /></div>}
      </KeyboardList>
      <form class="channel-chat-compose" onSubmit={send}>
        <input id="channel-chat-attachment-input" class="channel-chat-file-input" type="file" multiple onChange={selectFiles} />
        <IconButton
          class="channel-chat-attach"
          icon={paperclipIcon}
          type="button"
          ariaLabel="Add an attachment"
          title="Add an attachment"
          onClick={openAttachmentPicker}
        />
        <textarea use:bind={body} maxlength="4000" rows="1" placeholder={`Message #${readChannel().slug}`} aria-label="Channel chat message" onKeyDown={handleBodyKeyDown} />
        <Button type="submit" loading={busy}>Send message</Button>
        {attachments.value.length > 0 && (
          <div class="channel-chat-selected-attachments" aria-label="Selected attachments">
            {attachments.value.map(attachment => (
              <div class="channel-chat-selected-attachment" key={attachment.id}>
                <span class="channel-chat-attachment-icon" aria-hidden="true">📎︎</span>
                <span class="channel-chat-selected-attachment-name" title={attachment.name}>{attachment.name}</span>
                <button type="button" class="channel-chat-remove-attachment" aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </form>
      <div class="post-feed-error" role="alert">{error}</div>
    </Card>
  })

  onMount(() => {
    let wasMember = Boolean(readChannel().membershipRole)
    const stopMembershipEffect = effect(() => {
      const isMember = Boolean(readChannel().membershipRole)
      if (isMember && !wasMember) {
        state.value = 'loading'
        error.value = ''
        load()
      }
      wasMember = isMember
    })
    load()
    const stopRealtime = onRealtimeEvent('channel:chat:message', addMessage)
    return () => {
      stopMembershipEffect()
      stopRealtime()
    }
  })

  return content
}
