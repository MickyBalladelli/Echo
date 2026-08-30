import { createHash, randomBytes } from 'node:crypto'
import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'

const sessionLifetimeSeconds = 60 * 60 * 24 * 30
const sessionTouchIntervalSeconds = 60 * 5

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function queryOptions(transaction, type) {
  return {
    ...(type ? { type } : {}),
    ...(transaction ? { transaction } : {})
  }
}

export async function createSession(userId, { userAgent, ipAddress } = {}, transaction) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString()

  await sequelize.query(`
    INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (:userId, :tokenHash, :expiresAt, :userAgent, :ipAddress)
  `, {
    replacements: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null
    },
    ...queryOptions(transaction)
  })

  return { token, expiresAt, maxAgeSeconds: sessionLifetimeSeconds }
}

export async function findSessionByToken(token, transaction) {
  if (!token) return null

  const rows = await sequelize.query(`
    SELECT
      s.id AS session_id,
      s.user_id,
      s.expires_at,
      s.last_seen_at,
      u.username,
      u.email,
      u.created_at AS user_created_at,
      p.display_name,
      p.bio,
      p.avatar_url,
      p.banner_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE s.token_hash = :tokenHash
      AND s.revoked_at IS NULL
      AND s.expires_at > CURRENT_TIMESTAMP
      AND u.status = 'active'
      AND u.deleted_at IS NULL
    LIMIT 1
  `, {
    replacements: { tokenHash: hashToken(token) },
    ...queryOptions(transaction, QueryTypes.SELECT)
  })
  const row = rows[0]

  if (!row) return null

  const lastSeen = new Date(row.last_seen_at).getTime()
  if (Date.now() - lastSeen >= sessionTouchIntervalSeconds * 1000) {
    await sequelize.query(`
      UPDATE sessions
      SET last_seen_at = CURRENT_TIMESTAMP
      WHERE id = :sessionId
    `, {
      replacements: { sessionId: row.session_id },
      ...queryOptions(transaction)
    })
  }

  return {
    id: row.session_id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      email: row.email,
      createdAt: row.user_created_at,
      profile: {
        displayName: row.display_name || row.username,
        bio: row.bio || '',
        avatarUrl: row.avatar_url,
        bannerUrl: row.banner_url
      }
    }
  }
}

export async function revokeSession(token, transaction) {
  if (!token) return

  await sequelize.query(`
    UPDATE sessions
    SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
    WHERE token_hash = :tokenHash
  `, {
    replacements: { tokenHash: hashToken(token) },
    ...queryOptions(transaction)
  })
}
