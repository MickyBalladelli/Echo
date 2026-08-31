let socket = null
const desiredRooms = new Map()
const seenEventIds = new Set()
const eventSubscriptions = new Set()
const maxSeenEvents = 500

function roomKey(kind, id) {
  return `${kind}:${id}`
}

function resubscribeRooms() {
  if (!socket?.connected) return
  for (const room of desiredRooms.values()) socket.emit('room:join', room)
}

function attachEventSubscription(subscription) {
  if (!socket || subscription.listener) return
  subscription.listener = envelope => {
    if (acceptRealtimeEvent(envelope)) subscription.handler(envelope.data, envelope)
  }
  socket.on(subscription.type, subscription.listener)
}

function detachEventSubscription(subscription) {
  if (!socket || !subscription.listener) return
  socket.off(subscription.type, subscription.listener)
  subscription.listener = null
}

export function configureRealtimeSocket(nextSocket) {
  for (const subscription of eventSubscriptions) detachEventSubscription(subscription)
  socket = nextSocket
  socket.on('connect', resubscribeRooms)
  socket.on('connection:ready', resubscribeRooms)
  resubscribeRooms()
  for (const subscription of eventSubscriptions) attachEventSubscription(subscription)
}

export function joinRealtimeRoom(kind, id) {
  const room = { kind, id }
  const key = roomKey(kind, id)
  desiredRooms.set(key, room)
  if (socket?.connected) socket.emit('room:join', room)

  return () => {
    desiredRooms.delete(key)
    if (socket?.connected) socket.emit('room:leave', room)
  }
}

export function acceptRealtimeEvent(envelope) {
  const eventId = envelope?.eventId
  if (!eventId || seenEventIds.has(eventId)) return false
  seenEventIds.add(eventId)
  if (seenEventIds.size > maxSeenEvents) {
    const oldest = seenEventIds.values().next().value
    seenEventIds.delete(oldest)
  }
  return true
}

export function onRealtimeEvent(type, handler) {
  const subscription = { type, handler, listener: null }
  eventSubscriptions.add(subscription)
  attachEventSubscription(subscription)
  return () => {
    detachEventSubscription(subscription)
    eventSubscriptions.delete(subscription)
  }
}

export function onRealtimeControl(type, handler) {
  if (!socket) return () => {}
  socket.on(type, handler)
  return () => socket?.off(type, handler)
}

export function emitRealtime(type, payload, acknowledge) {
  if (!socket?.connected) {
    acknowledge?.({ ok: false, error: 'SOCKET_DISCONNECTED' })
    return
  }
  socket.emit(type, payload, acknowledge)
}
