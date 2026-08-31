import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'

const targetNotFoundMessages = Object.freeze({
  post: ['POST_NOT_FOUND', 'Post not found'],
  user: ['USER_NOT_FOUND', 'User not found'],
  channel: ['CHANNEL_NOT_FOUND', 'Channel not found'],
  message: ['MESSAGE_NOT_FOUND', 'Message not found']
})

function targetNotFound(targetType) {
  const [code, message] = targetNotFoundMessages[targetType]
  return new HttpError(404, code, message)
}

export async function requireStaff(userId, transaction) {
  const rows = await sequelize.query(`
    SELECT global_role
    FROM users
    WHERE id = :userId AND status = 'active' AND deleted_at IS NULL
    LIMIT 1
  `, {
    replacements: { userId },
    type: QueryTypes.SELECT,
    ...(transaction ? { transaction } : {})
  })
  const role = rows[0]?.global_role || 'user'
  if (!['moderator', 'admin'].includes(role)) {
    throw new HttpError(403, 'MODERATOR_REQUIRED', 'Moderator access required')
  }
  return role
}

async function getReportTarget(targetType, targetId, transaction) {
  if (targetType === 'post') {
    const rows = await sequelize.query(`
      SELECT id, author_id, moderation_status
      FROM posts
      WHERE id = :targetId AND deleted_at IS NULL
      LIMIT 1
    `, { replacements: { targetId }, type: QueryTypes.SELECT, transaction })
    return rows[0]
  }

  if (targetType === 'message') {
    const rows = await sequelize.query(`
      SELECT id, sender_id, conversation_id, moderation_status
      FROM chat_messages
      WHERE id = :targetId AND deleted_at IS NULL
      LIMIT 1
    `, { replacements: { targetId }, type: QueryTypes.SELECT, transaction })
    return rows[0]
  }

  if (targetType === 'user') {
    const rows = await sequelize.query(`
      SELECT id, status
      FROM users
      WHERE id = :targetId AND deleted_at IS NULL
      LIMIT 1
    `, { replacements: { targetId }, type: QueryTypes.SELECT, transaction })
    return rows[0]
  }

  const rows = await sequelize.query(`
    SELECT id, owner_id, name
    FROM channels
    WHERE id = :targetId AND deleted_at IS NULL
    LIMIT 1
  `, { replacements: { targetId }, type: QueryTypes.SELECT, transaction })
  return rows[0]
}

export async function reportTarget(reporterId, { targetType, targetId, reason }) {
  return withTransaction(async transaction => {
    if (targetType === 'user' && reporterId === targetId) {
      throw new HttpError(400, 'SELF_REPORT_NOT_ALLOWED', 'Cannot report yourself')
    }

    const target = await getReportTarget(targetType, targetId, transaction)
    if (!target) throw targetNotFound(targetType)

    if (targetType === 'message') {
      const membership = await sequelize.query(`
        SELECT 1
        FROM chat_members
        WHERE conversation_id = :conversationId AND user_id = :reporterId AND left_at IS NULL
        LIMIT 1
      `, {
        replacements: { conversationId: target.conversation_id, reporterId },
        type: QueryTypes.SELECT,
        transaction
      })
      if (!membership[0]) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
    }

    await sequelize.query(`
      INSERT INTO moderation_reports (reporter_id, target_type, target_id, reason)
      VALUES (:reporterId, :targetType, :targetId, :reason)
      ON CONFLICT (reporter_id, target_type, target_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        status = 'open',
        reviewed_by = NULL,
        reviewed_at = NULL,
        resolution_note = NULL,
        updated_at = CURRENT_TIMESTAMP
    `, {
      replacements: { reporterId, targetType, targetId, reason },
      transaction
    })

    if (targetType === 'post' && ['active', 'appeal_accepted'].includes(target.moderation_status)) {
      await sequelize.query(`UPDATE posts SET moderation_status = 'flagged', updated_at = CURRENT_TIMESTAMP WHERE id = :targetId`, {
        replacements: { targetId },
        transaction
      })
    }
    if (targetType === 'message' && ['active', 'appeal_accepted'].includes(target.moderation_status)) {
      await sequelize.query(`UPDATE chat_messages SET moderation_status = 'flagged', updated_at = CURRENT_TIMESTAMP WHERE id = :targetId`, {
        replacements: { targetId },
        transaction
      })
    }

    return { targetType, targetId, reported: true }
  })
}

function mapQueueItem(row) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    reporter: {
      id: row.reporter_id,
      username: row.reporter_username
    },
    target: {
      preview: row.target_preview || 'Unavailable target',
      status: row.target_status || 'unknown',
      ownerId: row.target_owner_id || null,
      channelSlug: row.target_channel_slug || null
    }
  }
}

function queueJoins(table) {
  const actorColumn = table === 'moderation_appeals' ? 'appellant_id' : 'reporter_id'
  return `
    JOIN users reporter ON reporter.id = ${table}.${actorColumn}
    LEFT JOIN posts target_post ON ${table}.target_type = 'post' AND target_post.id = ${table}.target_id
    LEFT JOIN chat_messages target_message ON ${table}.target_type = 'message' AND target_message.id = ${table}.target_id
    LEFT JOIN users target_user ON ${table}.target_type = 'user' AND target_user.id = ${table}.target_id
    LEFT JOIN channels target_channel ON ${table}.target_type = 'channel' AND target_channel.id = ${table}.target_id
  `
}

function queueSelect(table) {
  const actorColumn = table === 'moderation_appeals' ? 'appellant_id' : 'reporter_id'
  return `
    SELECT
      ${table}.id,
      ${table}.target_type,
      ${table}.target_id,
      ${table}.reason,
      ${table}.status,
      ${table}.created_at,
      ${table}.${actorColumn} AS reporter_id,
      reporter.username AS reporter_username,
      COALESCE(target_post.body, target_message.body, target_user.username, target_channel.name) AS target_preview,
      COALESCE(target_post.author_id, target_message.sender_id, target_user.id, target_channel.owner_id) AS target_owner_id,
      COALESCE(target_post.moderation_status, target_message.moderation_status, target_user.status,
        CASE WHEN target_channel.deleted_at IS NULL THEN 'active' ELSE 'removed' END) AS target_status,
      target_channel.slug AS target_channel_slug
    FROM ${table}
    ${queueJoins(table)}
    WHERE ${table}.status IN ('open', 'reviewing')
    ORDER BY ${table}.created_at ASC, ${table}.id ASC
    LIMIT :limit
  `
}

export async function listModerationQueue(staffId, limit = 50) {
  await requireStaff(staffId)
  const rows = await sequelize.query(queueSelect('moderation_reports'), {
    replacements: { limit },
    type: QueryTypes.SELECT
  })
  return rows.map(mapQueueItem)
}

export async function listModerationAppeals(staffId, limit = 50) {
  await requireStaff(staffId)
  const rows = await sequelize.query(queueSelect('moderation_appeals'), {
    replacements: { limit },
    type: QueryTypes.SELECT
  })
  return rows.map(row => {
    const item = mapQueueItem(row)
    return { ...item, appellant: item.reporter, reporter: undefined }
  })
}

async function getTargetState(targetType, targetId, transaction) {
  if (targetType === 'post') {
    const rows = await sequelize.query(`SELECT moderation_status, moderation_removed_by, moderation_removed_at, moderation_reason FROM posts WHERE id = :targetId FOR UPDATE`, {
      replacements: { targetId }, type: QueryTypes.SELECT, transaction
    })
    return rows[0] ? { ...rows[0] } : null
  }
  if (targetType === 'message') {
    const rows = await sequelize.query(`SELECT moderation_status, moderation_removed_by, moderation_removed_at, moderation_reason FROM chat_messages WHERE id = :targetId FOR UPDATE`, {
      replacements: { targetId }, type: QueryTypes.SELECT, transaction
    })
    return rows[0] ? { ...rows[0] } : null
  }
  if (targetType === 'user') {
    const rows = await sequelize.query(`SELECT status, deleted_at FROM users WHERE id = :targetId FOR UPDATE`, {
      replacements: { targetId }, type: QueryTypes.SELECT, transaction
    })
    return rows[0] ? { ...rows[0] } : null
  }
  const rows = await sequelize.query(`SELECT deleted_at FROM channels WHERE id = :targetId FOR UPDATE`, {
    replacements: { targetId }, type: QueryTypes.SELECT, transaction
  })
  return rows[0] ? { ...rows[0] } : null
}

async function setTargetState(targetType, targetId, action, moderatorId, note, transaction) {
  const previous = await getTargetState(targetType, targetId, transaction)
  if (!previous) throw targetNotFound(targetType)

  if (targetType === 'post') {
    const status = action === 'remove' ? 'removed' : action === 'appeal_rejected' ? 'appeal_rejected' : action === 'appeal_accepted' ? 'appeal_accepted' : 'active'
    await sequelize.query(`
      UPDATE posts
      SET moderation_status = :status,
          moderation_removed_by = CASE WHEN :status IN ('removed', 'appeal_rejected') THEN :moderatorId ELSE NULL END,
          moderation_removed_at = CASE WHEN :status IN ('removed', 'appeal_rejected') THEN CURRENT_TIMESTAMP ELSE NULL END,
          moderation_reason = CASE WHEN :status IN ('removed', 'appeal_rejected') THEN :note ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = :targetId
    `, { replacements: { status, moderatorId, note: note || null, targetId }, transaction })
  } else if (targetType === 'message') {
    const status = action === 'remove' ? 'hidden' : action === 'appeal_rejected' ? 'appeal_rejected' : action === 'appeal_accepted' ? 'appeal_accepted' : 'active'
    await sequelize.query(`
      UPDATE chat_messages
      SET moderation_status = :status,
          moderation_removed_by = CASE WHEN :status IN ('hidden', 'appeal_rejected') THEN :moderatorId ELSE NULL END,
          moderation_removed_at = CASE WHEN :status IN ('hidden', 'appeal_rejected') THEN CURRENT_TIMESTAMP ELSE NULL END,
          moderation_reason = CASE WHEN :status IN ('hidden', 'appeal_rejected') THEN :note ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = :targetId
    `, { replacements: { status, moderatorId, note: note || null, targetId }, transaction })
  } else if (targetType === 'user') {
    await sequelize.query(`UPDATE users SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :targetId`, {
      replacements: { status: action === 'remove' || action === 'appeal_rejected' ? 'suspended' : 'active', targetId }, transaction
    })
  } else {
    await sequelize.query(`UPDATE channels SET deleted_at = ${action === 'remove' || action === 'appeal_rejected' ? 'CURRENT_TIMESTAMP' : 'NULL'}, updated_at = CURRENT_TIMESTAMP WHERE id = :targetId`, {
      replacements: { targetId }, transaction
    })
  }

  return { previous, next: await getTargetState(targetType, targetId, transaction) }
}

export async function reviewModerationReport(staffId, reportId, input) {
  return withTransaction(async transaction => {
    await requireStaff(staffId, transaction)
    const rows = await sequelize.query(`
      SELECT id, target_type, target_id, status
      FROM moderation_reports
      WHERE id = :reportId AND status IN ('open', 'reviewing')
      FOR UPDATE
    `, { replacements: { reportId }, type: QueryTypes.SELECT, transaction })
    const report = rows[0]
    if (!report) throw new HttpError(404, 'REPORT_NOT_FOUND', 'Moderation report not found')

    let targetChange
    if (input.action === 'dismiss') {
      const current = await getTargetState(report.target_type, report.target_id, transaction)
      targetChange = { previous: current, next: current }
    } else {
      targetChange = await setTargetState(report.target_type, report.target_id, input.action, staffId, input.note, transaction)
    }
    const status = input.action === 'dismiss' ? 'dismissed' : 'resolved'
    await sequelize.query(`
      UPDATE moderation_reports
      SET status = :status, reviewed_by = :staffId, reviewed_at = CURRENT_TIMESTAMP,
          resolution_note = :note, updated_at = CURRENT_TIMESTAMP
      WHERE id = :reportId
    `, { replacements: { status, staffId, note: input.note || null, reportId }, transaction })
    await sequelize.query(`
      INSERT INTO moderation_audit_logs (moderator_id, report_id, target_type, target_id, action, previous_state, next_state, note)
      VALUES (:staffId, :reportId, :targetType, :targetId, :action, CAST(:previousState AS JSONB), CAST(:nextState AS JSONB), :note)
    `, {
      replacements: {
        staffId,
        reportId,
        targetType: report.target_type,
        targetId: report.target_id,
        action: input.action,
        previousState: JSON.stringify(targetChange.previous),
        nextState: JSON.stringify(targetChange.next),
        note: input.note || null
      },
      transaction
    })
    return { id: reportId, status, action: input.action }
  })
}

export async function createAppeal(userId, { targetType, targetId, reason }) {
  return withTransaction(async transaction => {
    if (!['post', 'message'].includes(targetType)) {
      throw new HttpError(400, 'APPEAL_NOT_SUPPORTED', 'Only removed posts and hidden messages can be appealed')
    }

    const target = await getTargetState(targetType, targetId, transaction)
    if (!target) throw targetNotFound(targetType)

    const ownerColumn = targetType === 'post' ? 'author_id' : 'sender_id'
    const rows = await sequelize.query(`
      SELECT id, ${ownerColumn} AS owner_id, moderation_status
      FROM ${targetType === 'post' ? 'posts' : 'chat_messages'}
      WHERE id = :targetId AND deleted_at IS NULL
      LIMIT 1
    `, { replacements: { targetId }, type: QueryTypes.SELECT, transaction })
    const owner = rows[0]
    if (!owner || owner.owner_id !== userId) throw new HttpError(403, 'APPEAL_OWNER_REQUIRED', 'Only the content owner can appeal')

    const allowedStates = targetType === 'post' ? ['removed', 'appeal_rejected'] : ['hidden', 'appeal_rejected']
    if (!allowedStates.includes(owner.moderation_status)) {
      throw new HttpError(400, 'APPEAL_STATE_INVALID', 'This content is not available for appeal')
    }

    const existing = await sequelize.query(`
      SELECT id FROM moderation_appeals
      WHERE appellant_id = :userId AND target_type = :targetType AND target_id = :targetId
        AND status IN ('open', 'reviewing')
      LIMIT 1
    `, { replacements: { userId, targetType, targetId }, type: QueryTypes.SELECT, transaction })
    if (existing[0]) throw new HttpError(409, 'APPEAL_ALREADY_OPEN', 'An appeal is already open')

    const appealRows = await sequelize.query(`
      INSERT INTO moderation_appeals (appellant_id, target_type, target_id, reason)
      VALUES (:userId, :targetType, :targetId, :reason)
      RETURNING id, status
    `, { replacements: { userId, targetType, targetId, reason }, type: QueryTypes.SELECT, transaction })

    const pendingStatus = 'appeal_pending'
    await sequelize.query(`
      UPDATE ${targetType === 'post' ? 'posts' : 'chat_messages'}
      SET moderation_status = :pendingStatus, updated_at = CURRENT_TIMESTAMP
      WHERE id = :targetId
    `, { replacements: { pendingStatus, targetId }, transaction })

    return { appealId: appealRows[0].id, targetType, targetId, status: appealRows[0].status }
  })
}

export async function reviewModerationAppeal(staffId, appealId, input) {
  return withTransaction(async transaction => {
    await requireStaff(staffId, transaction)
    const rows = await sequelize.query(`
      SELECT id, target_type, target_id, status
      FROM moderation_appeals
      WHERE id = :appealId AND status IN ('open', 'reviewing')
      FOR UPDATE
    `, { replacements: { appealId }, type: QueryTypes.SELECT, transaction })
    const appeal = rows[0]
    if (!appeal) throw new HttpError(404, 'APPEAL_NOT_FOUND', 'Moderation appeal not found')

    const action = input.decision === 'accept' ? 'appeal_accepted' : 'appeal_rejected'
    const targetChange = await setTargetState(appeal.target_type, appeal.target_id, action, staffId, input.note, transaction)
    const status = input.decision === 'accept' ? 'accepted' : 'rejected'
    await sequelize.query(`
      UPDATE moderation_appeals
      SET status = :status, reviewed_by = :staffId, reviewed_at = CURRENT_TIMESTAMP,
          resolution_note = :note, updated_at = CURRENT_TIMESTAMP
      WHERE id = :appealId
    `, { replacements: { status, staffId, note: input.note || null, appealId }, transaction })
    await sequelize.query(`
      INSERT INTO moderation_audit_logs (moderator_id, appeal_id, target_type, target_id, action, previous_state, next_state, note)
      VALUES (:staffId, :appealId, :targetType, :targetId, :action, CAST(:previousState AS JSONB), CAST(:nextState AS JSONB), :note)
    `, {
      replacements: {
        staffId,
        appealId,
        targetType: appeal.target_type,
        targetId: appeal.target_id,
        action: input.decision,
        previousState: JSON.stringify(targetChange.previous),
        nextState: JSON.stringify(targetChange.next),
        note: input.note || null
      },
      transaction
    })
    return { id: appealId, status, decision: input.decision }
  })
}
