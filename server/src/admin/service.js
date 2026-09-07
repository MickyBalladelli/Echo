import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { requireStaff } from '../moderation/service.js'

async function requireAdmin(userId) {
  const role = await requireStaff(userId)
  if (role !== 'admin') {
    throw new HttpError(403, 'ADMIN_REQUIRED', 'Admin access required')
  }
}

function mapAdminUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name || row.username,
    role: row.global_role || 'user',
    status: row.status,
    createdAt: row.created_at
  }
}

async function findAdminUser(userId) {
  const rows = await sequelize.query(`
    SELECT u.id, u.username, u.email, u.status, u.global_role, u.created_at,
      profile.display_name
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
      profile.display_name
    FROM users u
    LEFT JOIN profiles profile ON profile.user_id = u.id
    WHERE u.deleted_at IS NULL
    ORDER BY u.created_at ASC, u.id ASC
  `, { type: QueryTypes.SELECT })

  return rows.map(mapAdminUser)
}

export async function updateAdminUserRole(adminId, userId, role) {
  await requireAdmin(adminId)
  if (adminId === userId) {
    throw new HttpError(400, 'SELF_ROLE_CHANGE_NOT_ALLOWED', 'You cannot change your own role')
  }

  const target = await findAdminUser(userId)
  if (target.global_role === 'admin' && role !== 'admin') {
    const rows = await sequelize.query(`
      SELECT COUNT(*) AS admin_count
      FROM users
      WHERE global_role = 'admin' AND status = 'active' AND deleted_at IS NULL
    `, { type: QueryTypes.SELECT })
    if (Number(rows[0]?.admin_count || 0) <= 1) {
      throw new HttpError(400, 'LAST_ADMIN_REQUIRED', 'Echo needs at least one active admin')
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
  await requireAdmin(adminId)
  if (adminId === userId) {
    throw new HttpError(400, 'SELF_STATUS_CHANGE_NOT_ALLOWED', 'You cannot change your own account status')
  }

  await findAdminUser(userId)
  await sequelize.query(`
    UPDATE users
    SET status = :status, updated_at = CURRENT_TIMESTAMP
    WHERE id = :userId AND deleted_at IS NULL
  `, { replacements: { status, userId } })

  return mapAdminUser(await findAdminUser(userId))
}
