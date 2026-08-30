import { scryptSync, randomBytes } from 'node:crypto'
import { QueryTypes } from 'sequelize'
import { logger } from '../config/logger.js'
import { sequelize, withTransaction } from './pool.js'

const ids = Object.freeze({
  channel: '00000000-0000-4000-8000-000000000001',
  post: '00000000-0000-4000-8000-000000000002',
  reply: '00000000-0000-4000-8000-000000000003',
  conversation: '00000000-0000-4000-8000-000000000004',
  message: '00000000-0000-4000-8000-000000000005',
  notification: '00000000-0000-4000-8000-000000000006'
})

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

async function findOrCreateUser(user, transaction) {
  const existing = await sequelize.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER(:username) AND deleted_at IS NULL LIMIT 1',
    {
      replacements: { username: user.username },
      type: QueryTypes.SELECT,
      transaction
    }
  )

  if (existing[0]) {
    return existing[0].id
  }

  const rows = await sequelize.query(`
    INSERT INTO users (username, email, password_hash)
    VALUES (:username, :email, :passwordHash)
    RETURNING id
  `, {
    replacements: { ...user, passwordHash: hashPassword(user.password) },
    type: QueryTypes.SELECT,
    transaction
  })

  return rows[0].id
}

async function upsertProfile(userId, profile, transaction) {
  await sequelize.query(`
    INSERT INTO profiles (user_id, display_name, bio)
    VALUES (:userId, :displayName, :bio)
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      updated_at = CURRENT_TIMESTAMP
  `, {
    replacements: { userId, ...profile },
    transaction
  })
}

async function seed() {
  await withTransaction(async transaction => {
    const demoUserId = await findOrCreateUser({
      username: 'echo_demo',
      email: 'demo@echo.local',
      password: 'echo-demo-password'
    }, transaction)
    const friendUserId = await findOrCreateUser({
      username: 'echo_friend',
      email: 'friend@echo.local',
      password: 'echo-friend-password'
    }, transaction)

    await upsertProfile(demoUserId, {
      displayName: 'Echo Demo',
      bio: 'A local Echo account.'
    }, transaction)
    await upsertProfile(friendUserId, {
      displayName: 'Echo Friend',
      bio: 'Another local Echo account.'
    }, transaction)

    await sequelize.query(`
      INSERT INTO channels (id, owner_id, name, slug, description)
      VALUES (:id, :ownerId, 'Echo Builders', 'echo-builders', 'Build Echo in public.')
      ON CONFLICT (id) DO UPDATE SET
        owner_id = EXCLUDED.owner_id,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        description = EXCLUDED.description,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `, {
      replacements: { id: ids.channel, ownerId: demoUserId },
      transaction
    })

    await sequelize.query(`
      INSERT INTO channel_members (channel_id, user_id, role, left_at)
      VALUES (:channelId, :userId, 'owner', NULL)
      ON CONFLICT (channel_id, user_id) DO UPDATE SET role = 'owner', left_at = NULL
    `, {
      replacements: { channelId: ids.channel, userId: demoUserId },
      transaction
    })
    await sequelize.query(`
      INSERT INTO channel_members (channel_id, user_id, role, left_at)
      VALUES (:channelId, :userId, 'member', NULL)
      ON CONFLICT (channel_id, user_id) DO UPDATE SET role = 'member', left_at = NULL
    `, {
      replacements: { channelId: ids.channel, userId: friendUserId },
      transaction
    })

    await sequelize.query(`
      INSERT INTO posts (id, author_id, channel_id, body)
      VALUES (:id, :authorId, :channelId, 'Echo is alive. First local post.')
      ON CONFLICT (id) DO UPDATE SET
        author_id = EXCLUDED.author_id,
        channel_id = EXCLUDED.channel_id,
        body = EXCLUDED.body,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `, {
      replacements: { id: ids.post, authorId: demoUserId, channelId: ids.channel },
      transaction
    })
    await sequelize.query(`
      INSERT INTO posts (id, author_id, parent_post_id, body)
      VALUES (:id, :authorId, :parentPostId, 'Reply from the local seed user.')
      ON CONFLICT (id) DO UPDATE SET
        author_id = EXCLUDED.author_id,
        parent_post_id = EXCLUDED.parent_post_id,
        body = EXCLUDED.body,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `, {
      replacements: { id: ids.reply, authorId: friendUserId, parentPostId: ids.post },
      transaction
    })

    await sequelize.query(`
      INSERT INTO post_likes (post_id, user_id)
      VALUES (:postId, :userId)
      ON CONFLICT (post_id, user_id) DO NOTHING
    `, {
      replacements: { postId: ids.post, userId: friendUserId },
      transaction
    })
    await sequelize.query(`
      INSERT INTO follows (follower_id, following_id)
      VALUES (:followerId, :followingId)
      ON CONFLICT (follower_id, following_id) DO NOTHING
    `, {
      replacements: { followerId: friendUserId, followingId: demoUserId },
      transaction
    })

    await sequelize.query(`
      INSERT INTO chat_conversations (id, created_by, kind)
      VALUES (:id, :createdBy, 'direct')
      ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
    `, {
      replacements: { id: ids.conversation, createdBy: demoUserId },
      transaction
    })
    await sequelize.query(`
      INSERT INTO chat_members (conversation_id, user_id, role, left_at)
      VALUES (:conversationId, :userId, 'owner', NULL)
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL
    `, {
      replacements: { conversationId: ids.conversation, userId: demoUserId },
      transaction
    })
    await sequelize.query(`
      INSERT INTO chat_members (conversation_id, user_id, role, left_at)
      VALUES (:conversationId, :userId, 'member', NULL)
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL
    `, {
      replacements: { conversationId: ids.conversation, userId: friendUserId },
      transaction
    })
    await sequelize.query(`
      INSERT INTO chat_messages (id, conversation_id, sender_id, body)
      VALUES (:id, :conversationId, :senderId, 'Hello from Echo chat.')
      ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
    `, {
      replacements: { id: ids.message, conversationId: ids.conversation, senderId: demoUserId },
      transaction
    })
    await sequelize.query(`
      INSERT INTO chat_read_states (conversation_id, user_id, last_read_message_id)
      VALUES (:conversationId, :userId, :messageId)
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET
        last_read_message_id = EXCLUDED.last_read_message_id,
        last_read_at = CURRENT_TIMESTAMP
    `, {
      replacements: { conversationId: ids.conversation, userId: demoUserId, messageId: ids.message },
      transaction
    })

    await sequelize.query(`
      INSERT INTO notifications (id, recipient_id, actor_id, type, post_id, payload)
      VALUES (:id, :recipientId, :actorId, 'like', :postId, '{"source":"local-seed"}'::JSONB)
      ON CONFLICT (id) DO UPDATE SET read_at = NULL, created_at = CURRENT_TIMESTAMP
    `, {
      replacements: {
        id: ids.notification,
        recipientId: demoUserId,
        actorId: friendUserId,
        postId: ids.post
      },
      transaction
    })

    logger.info({ demoUserId, friendUserId }, 'Local seed data ready')
  })
}

try {
  await seed()
} catch (error) {
  logger.error({ err: error }, 'Database seed failed')
  process.exitCode = 1
} finally {
  await sequelize.close()
}
