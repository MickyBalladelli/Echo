import { computed, effect, html, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { emitRealtime, onRealtimeEvent } from '../lib/realtime.js'
import { ChannelChatMessage } from './ChannelChatMessage.jsx'
import { KeyboardList } from './KeyboardList.jsx'
import { VirtualList } from './VirtualList.jsx'

const paperclipIcon = html`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18.4 12.2 10.7 19.9a4.5 4.5 0 0 1-6.4-6.4l9.2-9.2a3 3 0 0 1 4.2 4.2l-9.2 9.2a1.5 1.5 0 0 1-2.1-2.1l8.5-8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`

export function ChannelChat({ slug, channel, currentUserId }) {
  const readChannel = () => channel?.value ?? channel
  const messages = signal([])
  const body = signal('')
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
      const viewport = messageViewport()
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    })
  }

  function addMessage(message) {
    if (message.channelId !== readChannel().id || messages.value.some(item => item.id === message.id)) return
    const viewport = messageViewport()
    const shouldStickToBottom = !viewport || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
    messages.value = [...messages.value, message]
    if (shouldStickToBottom) scrollMessagesToBottom()
    if (message.sender.id !== currentUserId) markRead(message.id)
  }

  function markRead(messageId) {
    apiRequest(`/api/channels/${encodeURIComponent(slug)}/chat/read/${encodeURIComponent(messageId)}`, { method: 'PUT' }).catch(() => {})
  }

  async function load() {
    if (!readChannel().membershipRole) {
      state.value = 'ready'
      return
    }
    try {
      const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/chat?limit=50`)
      messages.value = result.data
      const latest = messages.value.at(-1)
      if (latest && latest.sender.id !== currentUserId) markRead(latest.id)
      state.value = 'ready'
      scrollMessagesToBottom()
    } catch (requestError) {
      error.value = requestError.message || 'Could not load channel chat'
      state.value = 'error'
    }
  }

  async function send(event) {
    event.preventDefault()
    const cleanBody = body.value.trim()
    if (!cleanBody || busy.value) return
    busy.value = true
    error.value = ''
    emitRealtime('channel:chat:message:send', { channelId: readChannel().id, body: cleanBody }, async response => {
      if (response.ok) {
        addMessage(response.message)
        body.value = ''
      } else if (response.error === 'SOCKET_DISCONNECTED') {
        try {
          const result = await apiRequest(`/api/channels/${encodeURIComponent(slug)}/chat`, {
            method: 'POST', body: JSON.stringify({ body: cleanBody })
          })
          addMessage(result.data.message)
          body.value = ''
        } catch (requestError) {
          error.value = requestError.message || 'Could not send channel message'
        }
      } else {
        error.value = response.message || 'Could not send channel message'
      }
      busy.value = false
    })
  }

  function replyTo(message) {
    const prefix = `@${message.sender.username} `
    body.value = body.value.trim() ? `${prefix}${body.value}` : prefix
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
    if (state.value === 'error') return <Card><EmptyState status="error" title="Chat unavailable" description={error.value} /></Card>
    return <Card class="channel-chat-card">
      <KeyboardList label="Channel chat messages" className="channel-chat-list">
        {messages.value.length
          ? <VirtualList items={messages} estimateSize={72} label="Channel chat history" renderItem={renderMessage} />
          : <div class="channel-chat-empty"><EmptyState title="No messages yet" description="Start the conversation." /></div>}
      </KeyboardList>
      <form class="channel-chat-compose" onSubmit={send}>
        <button class="channel-chat-attach" type="button" aria-label="Add an attachment">{paperclipIcon}</button>
        <textarea use:bind={body} maxlength="4000" rows="1" placeholder={`Message #${readChannel().slug}`} aria-label="Channel chat message" />
        <Button type="submit" loading={busy}>Send message</Button>
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
