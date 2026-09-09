import { QueryTypes } from 'sequelize'
import { asJsonArray } from '../db/dialect.js'
import { sequelize } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { requireStaff } from '../moderation/service.js'

export async function requireAdmin(userId) {
  const role = await requireStaff(userId)
  if (!['admin', 'developer'].includes(role)) {
    throw new HttpError(403, 'ADMIN_REQUIRED', 'Admin access required')
  }
  return role
}

function mapAdminUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name || row.username,
    role: row.global_role || 'user',
    status: row.status,
    createdAt: row.created_at,
    badges: asJsonArray(row.badges)
  }
}

async function findAdminUser(userId) {
  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.email, u.status, u.global_role, u.created_at,
      profile.display_name,
      COALESCE((
        SELECT jsonb_agg(badge.badge_type ORDER BY CASE badge.badge_type WHEN 'verified' THEN 0 WHEN 'government' THEN 1 WHEN 'business' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END)
        FROM user_badges badge
        WHERE badge.user_id = u.id AND badge.revoked_at IS NULL
      ), '[]'::JSONB) AS badges
    FROM users u
    LEFT JOIN profiles profile ON profile.user_id = u.id
    WHERE u.id = :userId AND u.deleted_at IS NULL
    LIMIT 1
  `, {
    replacements: { userId },
    type: QueryTypes.SELECT
  })

  if (!rows[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found')
  return rows[0]
}

export async function listAdminUsers(adminId) {
  await requireAdmin(adminId)
  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.email, u.status, u.global_role, u.created_at,
      profile.display_name,
      COALESCE((
        SELECT jsonb_agg(badge.badge_type ORDER BY CASE badge.badge_type WHEN 'verified' THEN 0 WHEN 'government' THEN 1 WHEN 'business' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END)
        FROM user_badges badge
        WHERE badge.user_id = u.id AND badge.revoked_at IS NULL
      ), '[]'::JSONB) AS badges
    FROM users u
    LEFT JOIN profiles profile ON profile.user_id = u.id
    WHERE u.deleted_at IS NULL
    ORDER BY u.created_at ASC, u.id ASC
  `, { type: QueryTypes.SELECT })

  return rows.map(mapAdminUser)
}

export async function updateAdminUserRole(adminId, userId, role) {
  const actorRole = await requireAdmin(adminId)
  if (adminId === userId) {
    throw new HttpError(400, 'SELF_ROLE_CHANGE_NOT_ALLOWED', 'You cannot change your own role')
  }

  const target = await findAdminUser(userId)
  if (target.global_role === 'developer' && actorRole !== 'developer') {
    throw new HttpError(403, 'DEVELOPER_REQUIRED', 'Only a developer can manage developer access')
  }
  if (target.global_role === 'admin' && role !== 'admin') {
    const rows = await sequelize.query(`
      SELECT COUNT(*) AS admin_or_developer_count
      FROM users
      WHERE global_role IN ('admin', 'developer') AND status = 'active' AND deleted_at IS NULL
    `, { type: QueryTypes.SELECT })
    if (Number(rows[0]?.admin_or_developer_count || 0) <= 1) {
      throw new HttpError(400, 'LAST_ADMIN_REQUIRED', 'Echo needs at least one active admin or developer')
    }
  }

  await sequelize.query(`
    UPDATE users
    SET global_role = :role, updated_at = CURRENT_TIMESTAMP
    WHERE id = :userId AND deleted_at IS NULL
  `, { replacements: { role, userId } })

  return mapAdminUser(await findAdminUser(userId))
}

export async function updateAdminUserStatus(adminId, userId, status) {
  const actorRole = await requireAdmin(adminId)
  if (adminId === userId) {
    throw new HttpError(400, 'SELF_STATUS_CHANGE_NOT_ALLOWED', 'You cannot change your own account status')
  }

  const target = await findAdminUser(userId)
  if (target.global_role === 'developer' && actorRole !== 'developer') {
    throw new HttpError(403, 'DEVELOPER_REQUIRED', 'Only a developer can manage developer access')
  }
  await sequelize.query(`
    UPDATE users
    SET status = :status, updated_at = CURRENT_TIMESTAMP
    WHERE id = :userId AND deleted_at IS NULL
  `, { replacements: { status, userId } })

  return mapAdminUser(await findAdminUser(userId))
}

export async function updateAdminUserBadge(adminId, userId, badge, active) {
  await requireAdmin(adminId)
  await findAdminUser(userId)

  if (active) {
    await sequelize.query(`
      INSERT INTO user_badges (user_id, badge_type, granted_by, revoked_at)
      VALUES (:userId, :badge, :adminId, NULL)
      ON CONFLICT (user_id, badge_type) DO UPDATE
      SET granted_by = :adminId, revoked_at = NULL
    `, { replacements: { userId, badge, adminId } })
  } else {
    await sequelize.query(`
      UPDATE user_badges
      SET granted_by = :adminId, revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = :userId AND badge_type = :badge AND revoked_at IS NULL
    `, { replacements: { userId, badge, adminId } })
  }

  return mapAdminUser(await findAdminUser(userId))
}
