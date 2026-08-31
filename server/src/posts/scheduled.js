import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { createPost } from './service.js'

function mapScheduled(row) {
  return {
    id: row.id,
    payload: row.payload,
    scheduledAt: row.scheduled_at,
    status: row.status,
    postId: row.post_id || null,
    errorMessage: row.error_message || null,
    createdAt: row.created_at
  }
}

export async function schedulePost(userId, input) {
  const scheduledAt = new Date(input.scheduledAt)
  if (scheduledAt.getTime() <= Date.now() + 30000) throw new HttpError(400, 'SCHEDULE_TIME_INVALID', 'Schedule a post at least 30 seconds from now')
  if (scheduledAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) throw new HttpError(400, 'SCHEDULE_TIME_TOO_FAR', 'Schedule a post within one year')
  const payload = { ...input }
  delete payload.scheduledAt
  const rows = await sequelize.query(`
    INSERT INTO scheduled_posts (user_id, payload, scheduled_at)
    VALUES (:userId, CAST(:payload AS JSONB), :scheduledAt)
    RETURNING *
  `, { replacements: { userId, payload: JSON.stringify(payload), scheduledAt: scheduledAt.toISOString() }, type: QueryTypes.SELECT })
  return mapScheduled(rows[0])
}

export async function listScheduledPosts(userId) {
  const rows = await sequelize.query(`
    SELECT * FROM scheduled_posts WHERE user_id = :userId ORDER BY scheduled_at ASC, id ASC
  `, { replacements: { userId }, type: QueryTypes.SELECT })
  return rows.map(mapScheduled)
}

export async function cancelScheduledPost(userId, id) {
  const rows = await sequelize.query(`
    UPDATE scheduled_posts SET status = 'cancelled'
    WHERE id = :id AND user_id = :userId AND status = 'pending'
    RETURNING *
  `, { replacements: { id, userId }, type: QueryTypes.SELECT })
  if (!rows[0]) throw new HttpError(404, 'SCHEDULED_POST_NOT_FOUND', 'Scheduled post not found')
  return mapScheduled(rows[0])
}

export async function processScheduledPosts() {
  const jobs = await withTransaction(async transaction => {
    const rows = await sequelize.query(`
      UPDATE scheduled_posts
      SET status = 'processing'
      WHERE id IN (
        SELECT id FROM scheduled_posts
        WHERE (
          (status = 'pending' AND scheduled_at <= CURRENT_TIMESTAMP)
          OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
        )
        ORDER BY scheduled_at ASC, id ASC
        FOR UPDATE SKIP LOCKED LIMIT 20
      )
      RETURNING id, user_id, payload
    `, { type: QueryTypes.SELECT, transaction })
    return rows
  })

  for (const job of jobs) {
    try {
      const post = await createPost(job.user_id, job.payload)
      await sequelize.query(`
        UPDATE scheduled_posts SET status = 'published', post_id = :postId WHERE id = :id
      `, { replacements: { id: job.id, postId: post.id } })
    } catch (error) {
      await sequelize.query(`
        UPDATE scheduled_posts SET status = 'failed', error_message = :errorMessage WHERE id = :id
      `, { replacements: { id: job.id, errorMessage: String(error.message || 'Publish failed').slice(0, 500) } })
    }
  }
  return jobs.length
}

export function startScheduledPostWorker(intervalMs = 30000) {
  const timer = setInterval(() => processScheduledPosts().catch(() => {}), intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
