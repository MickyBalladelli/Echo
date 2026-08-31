import { QueryTypes } from 'sequelize'
import { HttpError } from '../http/errors.js'
import { sequelize, withTransaction } from '../db/pool.js'
import { createSession } from './sessions.js'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js'
import { recordSuspiciousLogin } from '../moderation/signals.js'
import { createEmailVerificationToken } from './tokens.js'
import { createTwoFactorChallenge } from './two-factor.js'

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
    role: row.global_role || row.role || 'user',
    profile: {
      displayName: row.display_name || row.username,
      bio: row.bio || '',
      avatarUrl: row.avatar_url || null,
      bannerUrl: row.banner_url || null,
      profileVisibility: row.profile_visibility || 'public',
      showFollowers: row.show_followers !== false,
      showFollowing: row.show_following !== false,
      locale: row.locale || 'en'
    },
    badges: row.badges || [],
    emailVerified: Boolean(row.email_verified_at)
  }
}

async function findUserByIdentifier(identifier, transaction) {
  const rows = await sequelize.query(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      u.status,
      u.global_role,
      u.created_at,
      u.email_verified_at,
      u.locale,
      EXISTS (SELECT 1 FROM user_two_factor factor WHERE factor.user_id = u.id AND factor.enabled = TRUE) AS two_factor_enabled,
      p.display_name,
      p.bio,
      p.avatar_url,
      p.banner_url,
      p.profile_visibility,
      p.show_followers,
      p.show_following,
      COALESCE((
        SELECT jsonb_agg(badge.badge_type ORDER BY CASE badge.badge_type WHEN 'staff' THEN 0 ELSE 1 END)
        FROM user_badges badge
        WHERE badge.user_id = u.id AND badge.revoked_at IS NULL
      ), '[]'::JSONB) AS badges
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE (LOWER(u.username) = LOWER(:identifier) OR LOWER(u.email) = LOWER(:identifier))
      AND u.deleted_at IS NULL
    LIMIT 1
  `, {
    replacements: { identifier },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })

  return rows[0] || null
}

export async function registerUser(input, requestInfo = {}) {
  try {
    return await withTransaction(async transaction => {
      const passwordHash = await hashPassword(input.password)
      const rows = await sequelize.query(`
        INSERT INTO users (username, email, password_hash)
        VALUES (:username, :email, :passwordHash)
        RETURNING id, username, email, created_at, global_role
      `, {
        replacements: { ...input, passwordHash },
        type: QueryTypes.SELECT,
        transaction
      })
      const user = rows[0]

      await sequelize.query(`
        INSERT INTO profiles (user_id, display_name, bio)
        VALUES (:userId, :displayName, :bio)
      `, {
        replacements: {
          userId: user.id,
          displayName: input.displayName,
          bio: input.bio
        },
        transaction
      })

      const session = await createSession(user.id, requestInfo, transaction)
      const emailVerificationToken = await createEmailVerificationToken(user.id, transaction)

      return {
        user: publicUser({ ...user, display_name: input.displayName, bio: input.bio }),
        session,
        emailVerificationToken
      }
    })
  } catch (error) {
    if (error?.original?.code === '23505') {
      throw new HttpError(400, 'REGISTRATION_FAILED', 'Unable to create account with those details')
    }

    throw error
  }
}

export async function loginUser(input, requestInfo = {}) {
  const user = await findUserByIdentifier(input.identifier)
  const passwordHash = user?.password_hash || DUMMY_PASSWORD_HASH
  const passwordMatches = await verifyPassword(input.password, passwordHash)

  if (!user || user.status !== 'active' || !passwordMatches) {
    await recordSuspiciousLogin({
      userId: user?.id || null,
      ipAddress: requestInfo.ipAddress,
      userAgent: requestInfo.userAgent,
      success: false
    })
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username, email, or password')
  }

  await recordSuspiciousLogin({
    userId: user.id,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
    success: true
  })

  if (user.two_factor_enabled) {
    return {
      user: publicUser(user),
      twoFactorRequired: true,
      challengeToken: await createTwoFactorChallenge(user.id, requestInfo)
    }
  }

  const session = await createSession(user.id, requestInfo)

  return {
    user: publicUser(user),
    session
  }
}

export async function updateUserProfile(userId, input) {
  const rows = await sequelize.query(`
    INSERT INTO profiles (
      user_id, display_name, bio, avatar_url, banner_url,
      profile_visibility, show_followers, show_following
    )
    VALUES (
      :userId, :displayName, :bio, :avatarUrl, :bannerUrl,
      :profileVisibility, :showFollowers, :showFollowing
    )
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      avatar_url = EXCLUDED.avatar_url,
      banner_url = EXCLUDED.banner_url,
      profile_visibility = EXCLUDED.profile_visibility,
      show_followers = EXCLUDED.show_followers,
      show_following = EXCLUDED.show_following,
      updated_at = CURRENT_TIMESTAMP
    RETURNING display_name, bio, avatar_url, banner_url, profile_visibility, show_followers, show_following
  `, {
    replacements: {
      userId,
      displayName: input.displayName,
      bio: input.bio,
      avatarUrl: input.avatarUrl ?? null,
      bannerUrl: input.bannerUrl ?? null,
      profileVisibility: input.profileVisibility,
      showFollowers: input.showFollowers,
      showFollowing: input.showFollowing
    },
    type: QueryTypes.SELECT
  })

  return rows[0]
}

export async function updateUserLocale(userId, locale) {
  await sequelize.query('UPDATE users SET locale = :locale WHERE id = :userId AND deleted_at IS NULL', {
    replacements: { userId, locale }
  })
  return { locale }
}
