import { randomUUID } from 'node:crypto'
import { logger } from '../config/logger.js'

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
  const envelope = realtimeEnvelope(type, data, eventId)
  logger.info({ room, type, eventId: envelope.eventId }, 'Realtime event published')
  realtimePublisher?.(room, type, envelope)
}
