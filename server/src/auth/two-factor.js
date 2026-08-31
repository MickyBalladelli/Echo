import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { createSession } from './sessions.js'

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const challengeLifetimeMs = 5 * 60 * 1000

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function decodeBase32(value) {
  const clean = value.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = ''
  for (const character of clean) {
    const index = base32Alphabet.indexOf(character)
    if (index < 0) throw new Error('Invalid base32 secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2))
  return Buffer.from(bytes)
}

function encodeBase32(buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let output = ''
  for (let index = 0; index < bits.length; index += 5) output += base32Alphabet[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)]
  return output
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  counterBuffer.writeUInt32BE(counter >>> 0, 4)
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest.at(-1) & 15
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000
  return String(number).padStart(6, '0')
}

function codesMatch(expected, actual) {
  const left = Buffer.from(expected)
  const right = Buffer.from(String(actual).replace(/\D/g, '').padStart(6, '0'))
  return left.length === right.length && timingSafeEqual(left, right)
}

export function verifyTotp(secret, code) {
  return [-1, 0, 1].some(offset => codesMatch(totp(secret, Date.now() + offset * 30000), code))
}

export async function getTwoFactor(userId) {
  const rows = await sequelize.query('SELECT secret, enabled FROM user_two_factor WHERE user_id = :userId LIMIT 1', {
    replacements: { userId }, type: QueryTypes.SELECT
  })
  return rows[0] || null
}

export async function beginTwoFactorSetup(userId, username) {
  const current = await getTwoFactor(userId)
  const secret = current?.secret || encodeBase32(randomBytes(20))
  await sequelize.query(`
    INSERT INTO user_two_factor (user_id, secret, enabled)
    VALUES (:userId, :secret, FALSE)
    ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, enabled = FALSE, updated_at = CURRENT_TIMESTAMP
  `, { replacements: { userId, secret } })
  return {
    secret,
    enabled: false,
    otpauthUrl: `otpauth://totp/Echo:${encodeURIComponent(username)}?secret=${secret}&issuer=Echo`
  }
}

export async function enableTwoFactor(userId, code) {
  const current = await getTwoFactor(userId)
  if (!current || !verifyTotp(current.secret, code)) throw new HttpError(400, 'INVALID_TWO_FACTOR_CODE', 'That authenticator code is not valid')
  await sequelize.query('UPDATE user_two_factor SET enabled = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = :userId', { replacements: { userId } })
  return { enabled: true }
}

export async function disableTwoFactor(userId, code) {
  const current = await getTwoFactor(userId)
  if (!current || !verifyTotp(current.secret, code)) throw new HttpError(400, 'INVALID_TWO_FACTOR_CODE', 'That authenticator code is not valid')
  await sequelize.query('UPDATE user_two_factor SET enabled = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = :userId', { replacements: { userId } })
  return { enabled: false }
}

export async function createTwoFactorChallenge(userId, requestInfo = {}) {
  const token = randomBytes(32).toString('base64url')
  await sequelize.query(`
    INSERT INTO two_factor_challenges (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (:userId, :tokenHash, :expiresAt, :userAgent, :ipAddress)
  `, {
    replacements: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + challengeLifetimeMs).toISOString(),
      userAgent: requestInfo.userAgent || null,
      ipAddress: requestInfo.ipAddress || null
    }
  })
  return token
}

export async function completeTwoFactorLogin(token, code, requestInfo = {}) {
  return withTransaction(async transaction => {
    const rows = await sequelize.query(`
      SELECT challenge.id, challenge.user_id, factor.secret
      FROM two_factor_challenges challenge
      JOIN user_two_factor factor ON factor.user_id = challenge.user_id AND factor.enabled = TRUE
      WHERE challenge.token_hash = :tokenHash
        AND challenge.consumed_at IS NULL
        AND challenge.expires_at > CURRENT_TIMESTAMP
      LIMIT 1 FOR UPDATE
    `, { replacements: { tokenHash: hashToken(token) }, type: QueryTypes.SELECT, transaction })
    const challenge = rows[0]
    if (!challenge || !verifyTotp(challenge.secret, code)) throw new HttpError(401, 'INVALID_TWO_FACTOR_CODE', 'That authenticator code is not valid')
    await sequelize.query('UPDATE two_factor_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = :id', {
      replacements: { id: challenge.id }, transaction
    })
    const session = await createSession(challenge.user_id, requestInfo, transaction)
    return { userId: challenge.user_id, session }
  })
}
