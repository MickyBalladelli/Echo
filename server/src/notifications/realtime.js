let notificationEmitter = null

export function setNotificationEmitter(emitter) {
  notificationEmitter = emitter
}

export function emitNotification(recipientId, event) {
  notificationEmitter?.(recipientId, event)
}
