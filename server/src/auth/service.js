import { QueryTypes } from 'sequelize'
import { HttpError } from '../http/errors.js'
import { sequelize, withTransaction } from '../db/pool.js'
import { createSession } from './sessions.js'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js'

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
    profile: {
      displayName: row.display_name || row.username,
      bio: row.bio || '',
      avatarUrl: row.avatar_url || null,
      bannerUrl: row.banner_url || null
    }
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
      u.created_at,
      p.display_name,
      p.bio,
      p.avatar_url,
      p.banner_url
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
        RETURNING id, username, email, created_at
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

      return {
        user: publicUser({ ...user, display_name: input.displayName, bio: input.bio }),
        session
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
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username, email, or password')
  }

  const session = await createSession(user.id, requestInfo)

  return {
    user: publicUser(user),
    session
  }
}

export async function updateUserProfile(userId, input) {
  const rows = await sequelize.query(`
    INSERT INTO profiles (user_id, display_name, bio, avatar_url, banner_url)
    VALUES (:userId, :displayName, :bio, :avatarUrl, :bannerUrl)
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      avatar_url = EXCLUDED.avatar_url,
      banner_url = EXCLUDED.banner_url,
      updated_at = CURRENT_TIMESTAMP
    RETURNING display_name, bio, avatar_url, banner_url
  `, {
    replacements: {
      userId,
      displayName: input.displayName,
      bio: input.bio,
      avatarUrl: input.avatarUrl ?? null,
      bannerUrl: input.bannerUrl ?? null
    },
    type: QueryTypes.SELECT
  })

  return rows[0]
}
