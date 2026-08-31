import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'

const failedLoginAttempts = new Map()
const suspiciousLoginWindowMs = 15 * 60 * 1000

async function writeSignal({ userId, eventType, action, metadata, transaction }) {
  try {
    await sequelize.query(`
      INSERT INTO moderation_signals (user_id, event_type, action, metadata)
      VALUES (:userId, :eventType, :action, CAST(:metadata AS JSONB))
    `, {
      replacements: {
        userId: userId || null,
        eventType,
        action,
        metadata: JSON.stringify(metadata || {})
      },
      type: QueryTypes.INSERT,
      ...(transaction ? { transaction } : {})
    })
  } catch {
    // Detection must not make normal posting unavailable if signal storage is down.
  }
}

export async function inspectContent({ userId, action, body, transaction }) {
  const value = String(body || '').trim()
  const compact = value.replace(/\s/g, '')
  const reasons = []

  if (/(.)\1{11,}/u.test(value)) reasons.push('repeated_characters')
  if ((value.match(/https?:\/\/[^\s<]+/giu) || []).length > 3) reasons.push('many_links')
  if (compact.length >= 40 && new Set(compact.toLowerCase()).size / compact.length < 0.18) reasons.push('low_character_variety')
  if (value.length >= 40 && value.replace(/[^A-Z]/g, '').length / Math.max(1, value.replace(/[^A-Za-z]/g, '').length) > 0.85) reasons.push('excessive_caps')

  if (!reasons.length) return { flagged: false, reasons: [] }

  await writeSignal({
    userId,
    eventType: 'spam',
    action,
    metadata: { reasons, length: value.length }
  }, transaction)

  return { flagged: true, reasons }
}

export async function recordSuspiciousLogin({ userId = null, ipAddress, userAgent, success }) {
  if (!ipAddress) return

  const now = Date.now()
  const current = failedLoginAttempts.get(ipAddress) || []
  const recent = current.filter(timestamp => now - timestamp < suspiciousLoginWindowMs)

  if (success) {
    failedLoginAttempts.delete(ipAddress)
    return
  }

  recent.push(now)
  failedLoginAttempts.set(ipAddress, recent)
  if (recent.length !== 3) return

  await writeSignal({
    userId,
    eventType: 'suspicious_login',
    action: 'login',
    metadata: {
      ipAddress,
      userAgent: userAgent || null,
      attempts: recent.length,
      windowSeconds: suspiciousLoginWindowMs / 1000
    }
  })
}
