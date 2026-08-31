import { computed, effect, onMount, signal } from '../lib/vendor.js'
import { Button, Card, EmptyState, Label } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { emitRealtime, onRealtimeEvent } from '../lib/realtime.js'
import { KeyboardList } from './KeyboardList.jsx'
import { VirtualList } from './VirtualList.jsx'

function messageText(message) {
  return <div class="channel-chat-message"><strong>{message.sender.displayName}</strong><span>{message.body}</span><time datetime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
}

export function ChannelChat({ slug, channel, currentUserId }) {
  const readChannel = () => channel?.value ?? channel
  const messages = signal([])
  const body = signal('')
  const state = signal('loading')
  const busy = signal(false)
  const error = signal('')

  function addMessage(message) {
    if (message.channelId !== readChannel().id || messages.value.some(item => item.id === message.id)) return
    messages.value = [...messages.value, message]
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

  const content = computed(() => {
    if (!readChannel().membershipRole) return <Card><EmptyState title="Join to chat" description="Channel chat is available to members." /></Card>
    if (state.value === 'loading') return <Card><div role="status">Loading channel chat…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Chat unavailable" description={error.value} /></Card>
    return <Card class="channel-chat-card">
      <Label size="small" tone="accent">CHANNEL CHAT</Label>
      <KeyboardList label="Channel chat messages" className="channel-chat-list">
        <VirtualList items={messages} estimateSize={72} label="Channel chat history" renderItem={messageText} />
      </KeyboardList>
      <form class="channel-chat-compose" onSubmit={send}>
        <textarea use:bind={body} maxlength="4000" rows="2" placeholder="Talk with channel members" aria-label="Channel chat message" />
        <Button type="submit" loading={busy}>Send</Button>
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
