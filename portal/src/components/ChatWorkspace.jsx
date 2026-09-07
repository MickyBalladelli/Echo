import { computed, onMount, signal } from '../lib/vendor.js'
import { Badge, Button, Card, CheckBox, EmptyState, FormField, Label, TextField } from '../lib/vendor.js'
import { apiRequest } from '../lib/api.js'
import { emitRealtime, joinRealtimeRoom, onRealtimeControl, onRealtimeEvent } from '../lib/realtime.js'
import { ChatMessage } from './ChatMessage.jsx'
import { ChatUserAutocomplete } from './ChatUserAutocomplete.jsx'
import { KeyboardList } from './KeyboardList.jsx'
import { LiveRegion } from './LiveRegion.jsx'
import { VirtualList } from './VirtualList.jsx'

export function ChatWorkspace({ router, conversationId = null, currentUserId, notificationVersion }) {
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
  const announcement = signal('')
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
    const previousConversation = conversations.value.find(item => item.id === conversationId)
    if (previousConversation?.unreadCount) {
      conversations.value = conversations.value.map(item => item.id === conversationId
        ? { ...item, unreadCount: 0 }
        : item)
    }
    emitRealtime('chat:read', { conversationId, messageId: latest.id }, response => {
      if (response.ok) {
        announcement.value = 'Messages marked read'
        return
      }
      if (previousConversation) {
        conversations.value = conversations.value.map(item => item.id === conversationId ? previousConversation : item)
      }
    })
  }

  function addMessage(message) {
    if (message.conversationId !== conversationId) {
      loadConversations()
      return
    }
    if (!messages.value.some(item => item.id === message.id)) messages.value = [...messages.value, message]
    markLatestRead()
    loadConversations()
  }

  function updateMessage(message) {
    messages.value = messages.value.map(item => item.id === message.id ? message : item)
  }

  function scrollMessagesToBottom() {
    if (typeof requestAnimationFrame !== 'function') return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = document.querySelector('.chat-messages-keyboard .virtual-list')
        if (viewport) viewport.scrollTop = viewport.scrollHeight
      })
    })
  }

  async function send(event) {
    event.preventDefault()
    const body = messageBody.value.trim()
    if (!body || busy.value || !conversationId) return
    busy.value = true
    error.value = ''
    try {
      const result = await apiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST', body: JSON.stringify({ body })
      })
      addMessage(result.data.message)
      messageBody.value = ''
      scrollMessagesToBottom()
    } catch (requestError) {
      error.value = requestError.code === 'CHAT_RESTRICTED'
        ? 'Message not sent. This user does not accept messages from you.'
        : requestError.message || 'Could not send message'
    } finally {
      busy.value = false
    }
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

  const conversationList = computed(() => conversations.value.map(item => (
    <a key={item.id} data-keyboard-item="true" class={item.id === conversationId ? 'chat-conversation-active' : ''} href={`/chat/${item.id}`} onClick={router.link(`/chat/${item.id}`)}>
      <strong>{item.title}</strong>
      <span>{item.lastMessage?.body || 'No messages yet'}</span>
      {item.unreadCount > 0 && <b>{item.unreadCount}</b>}
    </a>
  )))

  const conversationView = computed(() => {
    if (!conversationId) return <Card><EmptyState title="Choose a conversation" description="Open one or create a new chat." /></Card>
    if (state.value === 'loading') return <Card><div role="status">Loading messages…</div></Card>
    if (state.value === 'error') return <Card><EmptyState status="error" title="Chat unavailable" description={error.value} /></Card>
    return (
      <div class="chat-thread" aria-label={`Conversation ${conversation.value.title}`}>
        <Card class="chat-thread-header">
          <div class="chat-thread-title-row">
            <Label size="large">{conversation.value.title}</Label>
            <Badge size="small" tone="neutral">{`${conversation.value.members.length} members`}</Badge>
            {conversation.value.restrictedByOther && <Badge size="small" tone="error">Messaging restricted</Badge>}
          </div>
          <div class="chat-thread-actions">
            <Button variant="tertiary" size="small" onClick={toggleMute}>{conversation.value.muted ? 'Unmute' : 'Mute'}</Button>
            {conversation.value.kind === 'direct' && <Button variant="tertiary" size="small" onClick={toggleBlock}>{conversation.value.blockedByViewer ? 'Unblock' : 'Block'}</Button>}
          </div>
          <div class="chat-member-pills">
            {conversation.value.members.map(member => (
              <span key={member.id} class={onlineUserIds.value.includes(member.id) ? 'chat-member-online' : ''}>
                {member.displayName}{onlineUserIds.value.includes(member.id) ? ' ●' : ''}
                {conversation.value.kind === 'group' && conversation.value.role === 'owner' && member.id !== currentUserId && (
                  <Button variant="tertiary" size="small" ariaLabel={`Remove ${member.displayName} from conversation`} onClick={() => removeMember(member)}>Remove</Button>
                )}
              </span>
            ))}
          </div>
          {conversation.value.kind === 'group' && conversation.value.role === 'owner' && (
            <form class="chat-add-member" onSubmit={addMember}>
              <ChatUserAutocomplete value={addUsername} ariaLabel="Username" placeholder="Username" required />
              <Button type="submit" size="small">Add member</Button>
            </form>
          )}
        </Card>
        {nextCursor.value && <Button variant="secondary" loading={busy} onClick={loadOlder}>Load older messages</Button>}
        <KeyboardList label="Chat messages" className="chat-messages-keyboard">
          <VirtualList
            items={messages}
            estimateSize={104}
            label="Message history"
            renderItem={message => <ChatMessage message={message} currentUserId={currentUserId} onUpdated={updateMessage} onDeleted={updateMessage} />}
          />
        </KeyboardList>
        <div class="chat-typing" aria-live="polite">{typingUsers.value.length ? 'Someone is typing…' : ''}</div>
        <form class="chat-compose" onSubmit={send}>
          <textarea use:bind={messageBody} onInput={typeMessage} maxlength="4000" rows="3" placeholder="Write a message" aria-label="Message" />
          <Button type="button" onClick={send} loading={busy}>Send</Button>
        </form>
        {error.value && <div class="chat-compose-error" role="alert">{error}</div>}
        <LiveRegion message={announcement} />
      </div>
    )
  })
  const groupTitleField = computed(() => groupChat.value
    ? <FormField label="Group title"><TextField value={groupTitle} maxLength={100} required /></FormField>
    : null)

  onMount(() => {
    loadConversations()
    loadConversation()
    const stopNotificationRefresh = notificationVersion?.subscribe(() => loadConversations())
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
    if (stopNotificationRefresh) cleanups.push(stopNotificationRefresh)
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
          <FormField id="chat-create-usernames" label="Usernames" hint="One username for direct chat; commas for group">
            <ChatUserAutocomplete id="chat-create-usernames" value={createUsernames} ariaLabel="Usernames" placeholder="Find a user" allowMultiple={groupChat} required />
          </FormField>
          <CheckBox checked={groupChat}>Group chat</CheckBox>
          {groupTitleField}
          <Button type="submit" size="small" loading={busy}>Start chat</Button>
        </form>
        <KeyboardList label="Conversations" className="chat-conversation-list">
          {conversationList}
        </KeyboardList>
      </Card>
      {conversationView}
      {!conversationId && <div class="post-feed-error" role="alert">{error}</div>}
    </div>
  )
}
