import { computed, onMount, signal } from '../lib/vendor.js'
import { Button, Card, CheckBox, EmptyState, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { emitRealtime, joinRealtimeRoom, onRealtimeControl, onRealtimeEvent } from '../lib/realtime.js'
import { ChatMessage } from './ChatMessage.jsx'

export function ChatWorkspace({ router, conversationId = null, currentUserId }) {
  const conversations = signal([])
  const conversation = signal(null)
  const messages = signal([])
  const nextCursor = signal(null)
  const state = signal('loading')
  const error = signal('')
  const messageBody = signal('')
  const createUsernames = signal('')
  const groupTitle = signal('')
  const groupChat = signal(false)
  const addUsername = signal('')
  const typingUsers = signal([])
  const onlineUserIds = signal([])
  const busy = signal(false)
  let leaveRoom
  let typingTimer

  async function loadConversations() {
    try {
      const result = await apiRequest('/api/chat/conversations')
      conversations.value = result.data
      if (!conversationId) state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load conversations'
      state.value = 'error'
    }
  }

  async function loadConversation() {
    if (!conversationId) return
    state.value = 'loading'
    try {
      const [conversationResult, messageResult] = await Promise.all([
        apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}`),
        apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`)
      ])
      conversation.value = conversationResult.data.conversation
      messages.value = messageResult.data
      nextCursor.value = messageResult.meta?.nextCursor || null
      leaveRoom?.()
      leaveRoom = joinRealtimeRoom('conversation', conversationId)
      requestPresence()
      markLatestRead()
      state.value = 'ready'
    } catch (requestError) {
      error.value = requestError.message || 'Could not load conversation'
      state.value = 'error'
    }
  }

  async function loadOlder() {
    if (!nextCursor.value) return
    busy.value = true
    try {
      const result = await apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=50&cursor=${encodeURIComponent(nextCursor.value)}`)
      messages.value = [...result.data, ...messages.value]
      nextCursor.value = result.meta?.nextCursor || null
    } finally {
      busy.value = false
    }
  }

  function requestPresence() {
    if (!conversation.value) return
    emitRealtime('chat:presence:list', { userIds: conversation.value.members.map(member => member.id) }, response => {
      if (response.ok) onlineUserIds.value = response.onlineUserIds
    })
  }

  function markLatestRead() {
    const latest = messages.value.at(-1)
    if (!latest || latest.sender.id === currentUserId) return
    emitRealtime('chat:read', { conversationId, messageId: latest.id })
  }

  function addMessage(message) {
    if (message.conversationId !== conversationId) return
    if (!messages.value.some(item => item.id === message.id)) messages.value = [...messages.value, message]
    markLatestRead()
    loadConversations()
  }

  function updateMessage(message) {
    messages.value = messages.value.map(item => item.id === message.id ? message : item)
  }

  async function send(event) {
    event.preventDefault()
    const body = messageBody.value.trim()
    if (!body) return
    busy.value = true
    emitRealtime('chat:message:send', { conversationId, body }, async response => {
      if (response.ok) {
        addMessage(response.message)
        messageBody.value = ''
      } else if (response.error === 'SOCKET_DISCONNECTED') {
        try {
          const result = await apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: 'POST', body: JSON.stringify({ body })
          })
          addMessage(result.data.message)
          messageBody.value = ''
        } catch (requestError) {
          error.value = requestError.message || 'Could not send message'
        }
      } else {
        error.value = response.message || 'Could not send message'
      }
      busy.value = false
    })
  }

  function typeMessage() {
    emitRealtime('chat:typing', { conversationId, typing: true })
    clearTimeout(typingTimer)
    typingTimer = setTimeout(() => emitRealtime('chat:typing', { conversationId, typing: false }), 1200)
  }

  async function createConversation(event) {
    event.preventDefault()
    busy.value = true
    try {
      const result = await apiRequest('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({
          kind: groupChat.value ? 'group' : 'direct',
          usernames: createUsernames.value.split(',').map(value => value.trim()).filter(Boolean),
          ...(groupChat.value ? { title: groupTitle.value } : {})
        })
      })
      router.navigate(`/chat/${result.data.conversation.id}`)
    } catch (requestError) {
      error.value = requestError.message || 'Could not create conversation'
    } finally {
      busy.value = false
    }
  }

  async function toggleMute() {
    const result = await apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/preferences`, {
      method: 'PUT',
      body: JSON.stringify({ muted: !conversation.value.muted, notificationsEnabled: conversation.value.notificationsEnabled })
    })
    conversation.value = result.data.conversation
  }

  async function toggleBlock() {
    const other = conversation.value.members.find(member => member.id !== currentUserId)
    if (!other) return
    const blocked = !conversation.value.blockedByViewer
    await apiRequest(`/api/chat/blocks/${encodeURIComponent(other.id)}`, { method: blocked ? 'PUT' : 'DELETE' })
    conversation.value = { ...conversation.value, blockedByViewer: blocked }
  }

  async function addMember(event) {
    event.preventDefault()
    const result = await apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/members`, {
      method: 'POST', body: JSON.stringify({ username: addUsername.value })
    })
    conversation.value = result.data.conversation
    addUsername.value = ''
  }

  async function removeMember(member) {
    const result = await apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' })
    conversation.value = result.data.conversation
  }

  const conversationView = computed(() => {
    if (!conversationId) return <Card><EmptyState title="Choose a conversation" description="Open one or create a new chat." /></Card>
    if (state.value === 'loading') return <Card><div role="status">Loading messages…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Chat unavailable" description={error.value} /></Card>
    return (
      <div class="chat-thread">
        <Card class="chat-thread-header">
          <div><Label size="large">{conversation.value.title}</Label><span>{conversation.value.members.length} members</span></div>
          <div class="chat-thread-actions">
            <Button variant="tertiary" size="small" onClick={toggleMute}>{conversation.value.muted ? 'Unmute' : 'Mute'}</Button>
            {conversation.value.kind === 'direct' && <Button variant="tertiary" size="small" onClick={toggleBlock}>{conversation.value.blockedByViewer ? 'Unblock' : 'Block'}</Button>}
          </div>
          <div class="chat-member-pills">
            {conversation.value.members.map(member => (
              <span key={member.id} class={onlineUserIds.value.includes(member.id) ? 'chat-member-online' : ''}>
                {member.displayName}{onlineUserIds.value.includes(member.id) ? ' ●' : ''}
                {conversation.value.kind === 'group' && conversation.value.role === 'owner' && member.id !== currentUserId && (
                  <Button variant="tertiary" size="small" onClick={() => removeMember(member)}>Remove</Button>
                )}
              </span>
            ))}
          </div>
          {conversation.value.kind === 'group' && conversation.value.role === 'owner' && (
            <form class="chat-add-member" onSubmit={addMember}>
              <TextField value={addUsername} placeholder="Username" required />
              <Button type="submit" size="small">Add member</Button>
            </form>
          )}
        </Card>
        {nextCursor.value && <Button variant="secondary" loading={busy} onClick={loadOlder}>Load older messages</Button>}
        <div class="chat-messages">
          {messages.value.map(message => <ChatMessage key={message.id} message={message} currentUserId={currentUserId} onUpdated={updateMessage} onDeleted={updateMessage} />)}
        </div>
        <div class="chat-typing" aria-live="polite">{typingUsers.value.length ? 'Someone is typing…' : ''}</div>
        <form class="chat-compose" onSubmit={send}>
          <textarea use:bind={messageBody} onInput={typeMessage} maxlength="4000" rows="3" placeholder="Write a message" aria-label="Message" />
          <Button type="submit" loading={busy}>Send</Button>
        </form>
      </div>
    )
  })
  const groupTitleField = computed(() => groupChat.value
    ? <FormField label="Group title"><TextField value={groupTitle} maxLength={100} required /></FormField>
    : null)

  onMount(() => {
    loadConversations()
    loadConversation()
    const cleanups = [
      onRealtimeEvent('chat:message', addMessage),
      onRealtimeEvent('chat:message:updated', updateMessage),
      onRealtimeEvent('chat:message:deleted', updateMessage),
      onRealtimeEvent('chat:typing', data => {
        if (data.conversationId !== conversationId) return
        typingUsers.value = data.typing
          ? [...new Set([...typingUsers.value, data.userId])]
          : typingUsers.value.filter(id => id !== data.userId)
      }),
      onRealtimeEvent('chat:presence', data => {
        onlineUserIds.value = data.online
          ? [...new Set([...onlineUserIds.value, data.userId])]
          : onlineUserIds.value.filter(id => id !== data.userId)
      }),
      onRealtimeEvent('chat:read', data => {
        if (data.conversationId !== conversationId) return
        const reader = conversation.value?.members.find(member => member.id === data.userId)
        if (!reader) return
        const readIndex = messages.value.findIndex(message => message.id === data.messageId)
        messages.value = messages.value.map((message, index) => index <= readIndex && message.sender.id === currentUserId
          ? { ...message, readBy: [...message.readBy.filter(item => item.id !== reader.id), { id: reader.id, username: reader.username }] }
          : message)
      }),
      onRealtimeControl('connection:ready', () => {
        loadConversations()
        if (conversationId) loadConversation()
      })
    ]
    return () => {
      clearTimeout(typingTimer)
      leaveRoom?.()
      cleanups.forEach(cleanup => cleanup())
    }
  })

  return (
    <div class="chat-workspace">
      <Card class="chat-sidebar">
        <Label size="small" tone="accent">CONVERSATIONS</Label>
        <form class="chat-create-form" onSubmit={createConversation}>
          <FormField label="Usernames" hint="One username for direct chat; commas for group"><TextField value={createUsernames} required /></FormField>
          <CheckBox checked={groupChat}>Group chat</CheckBox>
          {groupTitleField}
          <Button type="submit" size="small" loading={busy}>Start chat</Button>
        </form>
        <div class="chat-conversation-list">
          {conversations.value.map(item => (
            <a key={item.id} class={item.id === conversationId ? 'chat-conversation-active' : ''} href={`/chat/${item.id}`} onClick={router.link(`/chat/${item.id}`)}>
              <strong>{item.title}</strong>
              <span>{item.lastMessage?.body || 'No messages yet'}</span>
              {item.unreadCount > 0 && <b>{item.unreadCount}</b>}
            </a>
          ))}
        </div>
      </Card>
      {conversationView}
      <div class="post-feed-error" role="alert">{error}</div>
    </div>
  )
}
