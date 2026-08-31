import { createHash, randomBytes } from 'node:crypto'
import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { hashPassword } from './password.js'

const tokenLifetimeMs = 60 * 60 * 1000

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function createToken(table, userId, transaction) {
  const token = randomBytes(32).toString('base64url')
  await sequelize.query(`
    UPDATE ${table}
    SET used_at = CURRENT_TIMESTAMP
    WHERE user_id = :userId AND used_at IS NULL
  `, { replacements: { userId }, transaction })
  await sequelize.query(`
    INSERT INTO ${table} (user_id, token_hash, expires_at)
    VALUES (:userId, :tokenHash, :expiresAt)
  `, {
    replacements: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + tokenLifetimeMs).toISOString()
    },
    transaction
  })
  return token
}

export async function createEmailVerificationToken(userId, transaction) {
  return createToken('email_verification_tokens', userId, transaction)
}

export async function createPasswordResetToken(identifier) {
  const rows = await sequelize.query(`
    SELECT id FROM users
    WHERE (LOWER(username) = LOWER(:identifier) OR LOWER(email) = LOWER(:identifier))
      AND deleted_at IS NULL AND status = 'active'
    LIMIT 1
  `, { replacements: { identifier }, type: QueryTypes.SELECT })
  if (!rows[0]) return null
  return withTransaction(transaction => createToken('password_reset_tokens', rows[0].id, transaction))
}

export async function verifyEmailToken(token) {
  return withTransaction(async transaction => {
    const rows = await sequelize.query(`
      SELECT user_id FROM email_verification_tokens
      WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1 FOR UPDATE
    `, {
      replacements: { tokenHash: hashToken(token) },
      type: QueryTypes.SELECT,
      transaction
    })
    if (!rows[0]) return false
    await sequelize.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = :userId', {
      replacements: { userId: rows[0].user_id }, transaction
    })
    await sequelize.query('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = :tokenHash', {
      replacements: { tokenHash: hashToken(token) }, transaction
    })
    return true
  })
}

export async function resetPassword(token, password) {
  return withTransaction(async transaction => {
    const rows = await sequelize.query(`
      SELECT user_id FROM password_reset_tokens
      WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1 FOR UPDATE
    `, {
      replacements: { tokenHash: hashToken(token) },
      type: QueryTypes.SELECT,
      transaction
    })
    if (!rows[0]) return false
    const passwordHash = await hashPassword(password)
    await sequelize.query('UPDATE users SET password_hash = :passwordHash WHERE id = :userId', {
      replacements: { passwordHash, userId: rows[0].user_id }, transaction
    })
    await sequelize.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = :tokenHash', {
      replacements: { tokenHash: hashToken(token) }, transaction
    })
    await sequelize.query(`
      UPDATE sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE user_id = :userId AND revoked_at IS NULL
    `, { replacements: { userId: rows[0].user_id }, transaction })
    return true
  })
}
