import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'

function mapDraft(row) {
  if (!row) return null
  return {
    id: row.id,
    channelId: row.channel_id,
    body: row.body,
    postFormat: row.post_format || 'short',
    visibility: row.visibility,
    imageUrl: row.image_url || null,
    imageAltText: row.image_alt_text || null,
    contentWarning: row.content_warning || null,
    updatedAt: row.updated_at
  }
}

export async function getPostDraft(userId, channelId = null) {
  const rows = await sequelize.query(`
    SELECT id, channel_id, body, post_format, visibility, image_url, image_alt_text, content_warning, updated_at
    FROM post_drafts
    WHERE user_id = :userId AND channel_id IS NOT DISTINCT FROM :channelId
    LIMIT 1
  `, {
    replacements: { userId, channelId },
    type: QueryTypes.SELECT
  })
  return mapDraft(rows[0])
}

export async function savePostDraft(userId, input) {
  const draft = { ...input, channelId: input.channelId || null }
  await withTransaction(async transaction => {
    const updated = await sequelize.query(`
      UPDATE post_drafts
      SET body = :body,
          post_format = :postFormat,
          visibility = :visibility,
          image_url = :imageUrl,
          image_alt_text = :imageAltText,
          content_warning = :contentWarning,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = :userId AND channel_id IS NOT DISTINCT FROM :channelId
      RETURNING id
    `, {
      replacements: { userId, ...draft, imageUrl: draft.imageUrl || null, imageAltText: draft.imageAltText || null, contentWarning: draft.contentWarning || null },
      type: QueryTypes.SELECT,
      transaction
    })

    if (!updated[0]) {
      await sequelize.query(`
        INSERT INTO post_drafts (
          user_id, channel_id, body, post_format, visibility, image_url, image_alt_text, content_warning
        )
        VALUES (:userId, :channelId, :body, :postFormat, :visibility, :imageUrl, :imageAltText, :contentWarning)
      `, {
        replacements: { userId, ...draft, imageUrl: draft.imageUrl || null, imageAltText: draft.imageAltText || null, contentWarning: draft.contentWarning || null },
        transaction
      })
    }
  })

  return getPostDraft(userId, draft.channelId)
}

export async function deletePostDraft(userId, channelId = null) {
  await sequelize.query(`
    DELETE FROM post_drafts
    WHERE user_id = :userId AND channel_id IS NOT DISTINCT FROM :channelId
  `, { replacements: { userId, channelId } })
  return { deleted: true }
}
