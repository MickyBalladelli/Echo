import { createHash, randomBytes } from 'node:crypto'
import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { hashPassword } from '../auth/password.js'
import { createSession } from '../auth/sessions.js'

const providers = Object.freeze({
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile'
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    profileUrl: 'https://api.github.com/user',
    scope: 'read:user user:email'
  }
})

function providerConfig(provider) {
  return providers[provider] || null
}

function clientId(provider) {
  return process.env[`${provider.toUpperCase()}_OAUTH_CLIENT_ID`]
}

function clientSecret(provider) {
  return process.env[`${provider.toUpperCase()}_OAUTH_CLIENT_SECRET`]
}

function hashState(state) {
  return createHash('sha256').update(state).digest('hex')
}

export function listOAuthProviders() {
  return Object.keys(providers).map(provider => ({
    provider,
    configured: Boolean(clientId(provider) && clientSecret(provider))
  }))
}

export async function createOAuthAuthorization(provider, redirectUri) {
  const config = providerConfig(provider)
  if (!config) return null
  const state = randomBytes(32).toString('base64url')
  await sequelize.query('DELETE FROM oauth_states WHERE expires_at <= CURRENT_TIMESTAMP OR consumed_at IS NOT NULL')
  await sequelize.query(`
    INSERT INTO oauth_states (provider, state_hash, expires_at)
    VALUES (:provider, :stateHash, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
  `, { replacements: { provider, stateHash: hashState(state) } })
  const parameters = new URLSearchParams({
    client_id: clientId(provider),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scope,
    state
  })
  return `${config.authorizeUrl}?${parameters.toString()}`
}

async function exchangeCode(provider, code, redirectUri) {
  const config = providerConfig(provider)
  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(provider), client_secret: clientSecret(provider), code, redirect_uri: redirectUri })
  })
  if (!tokenResponse.ok) throw new Error('OAuth token exchange failed')
  const token = await tokenResponse.json()
  if (!token.access_token) throw new Error('OAuth provider returned no access token')
  const profileResponse = await fetch(config.profileUrl, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'Echo OAuth client' }
  })
  if (!profileResponse.ok) throw new Error('OAuth profile request failed')
  const profile = await profileResponse.json()
  if (provider === 'github' && !profile.email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'Echo OAuth client' }
    })
    if (emailsResponse.ok) {
      const emails = await emailsResponse.json()
      profile.email = emails.find(email => email.primary)?.email || emails[0]?.email
    }
  }
  return profile
}

function safeUsername(value) {
  const normalized = String(value || 'echo_user').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24)
  return normalized.padEnd(3, 'user').slice(0, 32)
}

export async function completeOAuthLogin(provider, code, state, redirectUri, requestInfo = {}) {
  const config = providerConfig(provider)
  if (!config) throw new Error('Unknown OAuth provider')
  const profile = await exchangeCode(provider, code, redirectUri)
  const providerAccountId = String(profile.sub || profile.id || '')
  if (!providerAccountId) throw new Error('OAuth provider returned no account id')
  const email = String(profile.email || `${providerAccountId}@oauth.invalid`).toLowerCase()
  const displayName = String(profile.name || profile.login || email.split('@')[0]).slice(0, 80)

  return withTransaction(async transaction => {
    const stateRows = await sequelize.query(`
      UPDATE oauth_states SET consumed_at = CURRENT_TIMESTAMP
      WHERE provider = :provider AND state_hash = :stateHash AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      RETURNING id
    `, { replacements: { provider, stateHash: hashState(state) }, type: QueryTypes.SELECT, transaction })
    if (!stateRows[0]) throw new Error('OAuth state is invalid or expired')

    const accountRows = await sequelize.query('SELECT user_id FROM oauth_accounts WHERE provider = :provider AND provider_account_id = :providerAccountId LIMIT 1', {
      replacements: { provider, providerAccountId }, type: QueryTypes.SELECT, transaction
    })
    let userId = accountRows[0]?.user_id
    if (!userId) {
      const emailRows = await sequelize.query('SELECT id FROM users WHERE LOWER(email) = LOWER(:email) AND deleted_at IS NULL LIMIT 1', {
        replacements: { email }, type: QueryTypes.SELECT, transaction
      })
      userId = emailRows[0]?.id
    }
    if (!userId) {
      const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))
      const username = safeUsername(profile.login || profile.name || `${provider}_${providerAccountId}`)
      const userRows = await sequelize.query(`
        INSERT INTO users (username, email, password_hash, email_verified_at)
        VALUES (:username, :email, :passwordHash, CURRENT_TIMESTAMP)
        RETURNING id
      `, { replacements: { username, email, passwordHash }, type: QueryTypes.SELECT, transaction })
      userId = userRows[0].id
      await sequelize.query('INSERT INTO profiles (user_id, display_name, avatar_url) VALUES (:userId, :displayName, :avatarUrl)', {
        replacements: { userId, displayName, avatarUrl: profile.picture || profile.avatar_url || null }, transaction
      })
    }
    await sequelize.query(`
      INSERT INTO oauth_accounts (user_id, provider, provider_account_id, profile)
      VALUES (:userId, :provider, :providerAccountId, CAST(:profile AS JSONB))
      ON CONFLICT (provider, provider_account_id) DO UPDATE SET user_id = EXCLUDED.user_id, profile = EXCLUDED.profile, updated_at = CURRENT_TIMESTAMP
    `, { replacements: { userId, provider, providerAccountId, profile: JSON.stringify(profile) }, transaction })
    const session = await createSession(userId, requestInfo, transaction)
    return { session }
  })
}

export async function listLinkedOAuthAccounts(userId) {
  const rows = await sequelize.query(`
    SELECT id, provider, provider_account_id, created_at
    FROM oauth_accounts WHERE user_id = :userId ORDER BY created_at ASC
  `, { replacements: { userId }, type: QueryTypes.SELECT })
  return rows.map(row => ({ id: row.id, provider: row.provider, accountId: row.provider_account_id, createdAt: row.created_at }))
}
