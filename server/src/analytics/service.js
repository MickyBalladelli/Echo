import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'

export const analyticsEventNames = new Set([
  'page_view',
  'post_created',
  'post_viewed',
  'post_liked',
  'post_reposted',
  'channel_joined',
  'chat_opened',
  'draft_saved'
])

function safeProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {}
  return Object.fromEntries(Object.entries(properties)
    .filter(([key, value]) => /^[a-zA-Z0-9_]{1,32}$/.test(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 12))
}

export async function recordAnalyticsEvent(userId, eventName, properties) {
  if (!analyticsEventNames.has(eventName)) return { recorded: false }
  await sequelize.query(`
    INSERT INTO analytics_events (user_id, event_name, properties)
    VALUES (:userId, :eventName, CAST(:properties AS JSONB))
  `, {
    replacements: { userId, eventName, properties: JSON.stringify(safeProperties(properties)) }
  })
  return { recorded: true }
}

export async function getAnalyticsSummary(userId, days = 30) {
  const rows = await sequelize.query(`
    SELECT event_name, COUNT(*)::INTEGER AS event_count, DATE_TRUNC('day', occurred_at)::DATE AS day
    FROM analytics_events
    WHERE user_id = :userId AND occurred_at >= CURRENT_TIMESTAMP - (:days * INTERVAL '1 day')
    GROUP BY event_name, DATE_TRUNC('day', occurred_at)
    ORDER BY day ASC, event_name ASC
  `, { replacements: { userId, days }, type: QueryTypes.SELECT })
  return rows.map(row => ({ eventName: row.event_name, count: Number(row.event_count), day: row.day }))
}
