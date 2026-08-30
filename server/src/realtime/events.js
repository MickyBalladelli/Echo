import { randomUUID } from 'node:crypto'

let realtimePublisher = null

export function setRealtimePublisher(publisher) {
  realtimePublisher = publisher
}

export function realtimeEnvelope(type, data, eventId = randomUUID()) {
  return {
    eventId,
    type,
    occurredAt: new Date().toISOString(),
    data
  }
}

export function publishRealtimeEvent(room, type, data, eventId) {
  realtimePublisher?.(room, type, realtimeEnvelope(type, data, eventId))
}
