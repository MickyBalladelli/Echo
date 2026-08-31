import { QueryTypes } from 'sequelize'
import { sequelize, withTransaction } from '../db/pool.js'

const exportTables = Object.freeze([
  ['profile', 'SELECT * FROM profiles WHERE user_id = :userId'],
  ['posts', 'SELECT * FROM posts WHERE author_id = :userId ORDER BY created_at ASC'],
  ['notes', 'SELECT * FROM notes WHERE user_id = :userId ORDER BY created_at ASC'],
  ['follows', 'SELECT * FROM follows WHERE follower_id = :userId OR following_id = :userId ORDER BY created_at ASC'],
  ['bookmarks', 'SELECT * FROM post_bookmarks WHERE user_id = :userId ORDER BY created_at ASC'],
  ['channelMemberships', 'SELECT * FROM channel_members WHERE user_id = :userId ORDER BY joined_at ASC'],
  ['chatMemberships', 'SELECT * FROM chat_members WHERE user_id = :userId ORDER BY joined_at ASC'],
  ['chatMessages', `SELECT message.* FROM chat_messages message JOIN chat_members member ON member.conversation_id = message.conversation_id WHERE member.user_id = :userId ORDER BY message.created_at ASC`],
  ['channelChatMessages', 'SELECT * FROM channel_chat_messages WHERE sender_id = :userId ORDER BY created_at ASC'],
  ['notifications', 'SELECT * FROM notifications WHERE recipient_id = :userId ORDER BY created_at ASC'],
  ['scheduledPosts', 'SELECT * FROM scheduled_posts WHERE user_id = :userId ORDER BY created_at ASC'],
  ['analyticsEvents', 'SELECT * FROM analytics_events WHERE user_id = :userId ORDER BY occurred_at ASC']
])

export async function exportUserData(userId) {
  const [userRows, ...collections] = await Promise.all([
    sequelize.query('SELECT id, username, email, email_verified_at, locale, created_at, deleted_at FROM users WHERE id = :userId LIMIT 1', {
      replacements: { userId }, type: QueryTypes.SELECT
    }),
    ...exportTables.map(([, sql]) => sequelize.query(sql, { replacements: { userId }, type: QueryTypes.SELECT }))
  ])
  const data = { user: userRows[0] || null }
  exportTables.forEach(([name], index) => { data[name] = collections[index] })
  return { exportedAt: new Date().toISOString(), data }
}

export async function deleteUserAccount(userId) {
  return withTransaction(async transaction => {
    await sequelize.query(`
      UPDATE users
      SET status = 'deleted', deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), email = CONCAT('deleted+', id, '@invalid.echo')
      WHERE id = :userId AND deleted_at IS NULL
    `, { replacements: { userId }, transaction })
    await sequelize.query('UPDATE sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE user_id = :userId', {
      replacements: { userId }, transaction
    })
    return { deleted: true }
  })
}
