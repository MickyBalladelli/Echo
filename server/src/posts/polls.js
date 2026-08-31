import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'
import { HttpError } from '../http/errors.js'

async function pollForPost(postId, viewerId = null, transaction) {
  const rows = await sequelize.query(`
    SELECT poll.id, poll.question, poll.expires_at,
      COUNT(vote.user_id)::INTEGER AS total_votes,
      (SELECT option_id FROM poll_votes viewer_vote WHERE viewer_vote.poll_id = poll.id AND viewer_vote.user_id = :viewerId LIMIT 1) AS viewer_option_id,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', option.id, 'label', option.label, 'position', option.position,
          'votes', (SELECT COUNT(*)::INTEGER FROM poll_votes option_vote WHERE option_vote.option_id = option.id)
        ) ORDER BY option.position)
        FROM poll_options option WHERE option.poll_id = poll.id
      ), '[]'::JSONB) AS options
    FROM post_polls poll
    LEFT JOIN poll_votes vote ON vote.poll_id = poll.id
    WHERE poll.post_id = :postId
    GROUP BY poll.id
    LIMIT 1
  `, { replacements: { postId, viewerId }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) })
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    question: row.question,
    expiresAt: row.expires_at,
    totalVotes: Number(row.total_votes),
    viewerOptionId: row.viewer_option_id || null,
    options: row.options || []
  }
}

export async function createPoll(userId, postId, input) {
  return withTransaction(async transaction => {
    const postRows = await sequelize.query(`
      SELECT id FROM posts WHERE id = :postId AND author_id = :userId AND deleted_at IS NULL LIMIT 1
    `, { replacements: { postId, userId }, type: QueryTypes.SELECT, transaction })
    if (!postRows[0]) throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found')
    const existing = await sequelize.query('SELECT id FROM post_polls WHERE post_id = :postId LIMIT 1', {
      replacements: { postId }, type: QueryTypes.SELECT, transaction
    })
    if (existing[0]) throw new HttpError(409, 'POLL_EXISTS', 'This post already has a poll')
    const rows = await sequelize.query(`
      INSERT INTO post_polls (post_id, question, expires_at)
      VALUES (:postId, :question, :expiresAt) RETURNING id
    `, { replacements: { postId, question: input.question, expiresAt: input.expiresAt || null }, type: QueryTypes.SELECT, transaction })
    for (const [position, label] of input.options.entries()) {
      await sequelize.query(`
        INSERT INTO poll_options (poll_id, label, position) VALUES (:pollId, :label, :position)
      `, { replacements: { pollId: rows[0].id, label, position }, transaction })
    }
    return pollForPost(postId, userId, transaction)
  })
}

export async function votePoll(userId, postId, optionId) {
  return withTransaction(async transaction => {
    const rows = await sequelize.query(`
      SELECT poll.id, poll.expires_at
      FROM post_polls poll
      JOIN poll_options option ON option.poll_id = poll.id AND option.id = :optionId
      JOIN posts post ON post.id = poll.post_id AND post.deleted_at IS NULL
      WHERE poll.post_id = :postId
        AND (poll.expires_at IS NULL OR poll.expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
    `, { replacements: { postId, optionId }, type: QueryTypes.SELECT, transaction })
    if (!rows[0]) throw new HttpError(400, 'POLL_CLOSED', 'Poll is closed or option is invalid')
    await sequelize.query(`
      INSERT INTO poll_votes (poll_id, option_id, user_id)
      VALUES (:pollId, :optionId, :userId)
      ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id, created_at = CURRENT_TIMESTAMP
    `, { replacements: { pollId: rows[0].id, optionId, userId }, transaction })
    return pollForPost(postId, userId, transaction)
  })
}
