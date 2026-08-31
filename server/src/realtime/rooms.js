import { QueryTypes } from 'sequelize'
import { sequelize } from '../db/pool.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const roomKinds = new Set(['channel', 'post', 'conversation'])
const maxExplicitRooms = 100

export const roomName = (kind, id) => `${kind}:${id}`

async function canJoinChannel(userId, channelId) {
  const rows = await sequelize.query(`
    SELECT c.id
    FROM channels c
    LEFT JOIN channel_members member ON member.channel_id = c.id
      AND member.user_id = :userId AND member.left_at IS NULL
    LEFT JOIN channel_invites invitation ON invitation.channel_id = c.id
      AND invitation.user_id = :userId AND invitation.accepted_at IS NULL
    WHERE c.id = :channelId AND c.deleted_at IS NULL
      AND (c.visibility = 'public' OR member.user_id IS NOT NULL OR invitation.user_id IS NOT NULL)
    LIMIT 1
  `, { replacements: { userId, channelId }, type: QueryTypes.SELECT })
  return Boolean(rows[0])
}

async function canJoinPost(userId, postId) {
  const rows = await sequelize.query(`
    SELECT post.id
    FROM posts post
    LEFT JOIN channels channel ON channel.id = post.channel_id AND channel.deleted_at IS NULL
    LEFT JOIN channel_members member ON member.channel_id = channel.id
      AND member.user_id = :userId AND member.left_at IS NULL
    WHERE post.id = :postId AND post.deleted_at IS NULL
      AND (
        post.visibility = 'public'
        OR (post.visibility = 'followers' AND (
          post.author_id = :userId OR EXISTS (
            SELECT 1 FROM follows visibility_follow
            WHERE visibility_follow.follower_id = :userId
              AND visibility_follow.following_id = post.author_id
          )
        ))
        OR (post.visibility = 'private' AND post.author_id = :userId)
      )
      AND (post.channel_id IS NULL OR channel.visibility = 'public' OR member.user_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks blocked
        WHERE (blocked.blocker_id = :userId AND blocked.blocked_id = post.author_id)
           OR (blocked.blocker_id = post.author_id AND blocked.blocked_id = :userId)
      )
      AND (
        post.moderation_status IN ('active', 'flagged', 'appeal_accepted')
        OR post.author_id = :userId
        OR EXISTS (
          SELECT 1 FROM users moderation_user
          WHERE moderation_user.id = :userId
            AND moderation_user.global_role IN ('moderator', 'admin')
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_mutes muted
        WHERE muted.user_id = :userId AND muted.muted_user_id = post.author_id
      )
      AND (
        post.author_id = :userId
        OR NOT EXISTS (
          SELECT 1 FROM profiles private_profile
          WHERE private_profile.user_id = post.author_id
            AND private_profile.profile_visibility = 'followers'
        )
        OR EXISTS (
          SELECT 1 FROM follows profile_follow
          WHERE profile_follow.follower_id = :userId
            AND profile_follow.following_id = post.author_id
        )
      )
    LIMIT 1
  `, { replacements: { userId, postId }, type: QueryTypes.SELECT })
  return Boolean(rows[0])
}

async function canJoinConversation(userId, conversationId) {
  const rows = await sequelize.query(`
    SELECT conversation.id
    FROM chat_conversations conversation
    JOIN chat_members member ON member.conversation_id = conversation.id
      AND member.user_id = :userId AND member.left_at IS NULL
    WHERE conversation.id = :conversationId AND conversation.deleted_at IS NULL
      AND (conversation.kind <> 'direct' OR NOT EXISTS (
        SELECT 1
        FROM chat_members other_member
        JOIN user_blocks blocked ON (
          (blocked.blocker_id = :userId AND blocked.blocked_id = other_member.user_id)
          OR (blocked.blocker_id = other_member.user_id AND blocked.blocked_id = :userId)
        )
        WHERE other_member.conversation_id = conversation.id
          AND other_member.user_id <> :userId
          AND other_member.left_at IS NULL
      ))
    LIMIT 1
  `, { replacements: { userId, conversationId }, type: QueryTypes.SELECT })
  return Boolean(rows[0])
}

async function canJoin(userId, kind, id) {
  if (kind === 'channel') return canJoinChannel(userId, id)
  if (kind === 'post') return canJoinPost(userId, id)
  if (kind === 'conversation') return canJoinConversation(userId, id)
  return false
}

async function joinMembershipRooms(socket, userId) {
  const channels = await sequelize.query(`
    SELECT channel_id AS id FROM channel_members
    WHERE user_id = :userId AND left_at IS NULL
  `, { replacements: { userId }, type: QueryTypes.SELECT })
  const conversations = await sequelize.query(`
    SELECT member.conversation_id AS id
    FROM chat_members member
    JOIN chat_conversations conversation ON conversation.id = member.conversation_id
      AND conversation.deleted_at IS NULL
    WHERE member.user_id = :userId AND member.left_at IS NULL
  `, { replacements: { userId }, type: QueryTypes.SELECT })
  const rooms = [
    roomName('user', userId),
    ...channels.map(channel => roomName('channel', channel.id)),
    ...conversations.map(conversation => roomName('conversation', conversation.id))
  ]
  await socket.join(rooms)
  return rooms
}

export async function initializeSocketRooms(socket) {
  const userId = socket.data.auth.userId
  socket.data.explicitRooms = new Set()
  socket.data.automaticRooms = new Set(await joinMembershipRooms(socket, userId))

  socket.on('room:join', async (request = {}, acknowledge = () => {}) => {
    const kind = String(request.kind || '')
    const id = String(request.id || '')
    if (!roomKinds.has(kind) || !uuidPattern.test(id)) {
      acknowledge({ ok: false, error: 'INVALID_ROOM' })
      return
    }
    if (socket.data.explicitRooms.size >= maxExplicitRooms) {
      acknowledge({ ok: false, error: 'ROOM_LIMIT_REACHED' })
      return
    }
    try {
      if (!await canJoin(userId, kind, id)) {
        acknowledge({ ok: false, error: 'ROOM_ACCESS_DENIED' })
        return
      }
      const room = roomName(kind, id)
      await socket.join(room)
      socket.data.explicitRooms.add(room)
      acknowledge({ ok: true, room })
    } catch {
      acknowledge({ ok: false, error: 'ROOM_JOIN_FAILED' })
    }
  })

  socket.on('room:leave', async (request = {}, acknowledge = () => {}) => {
    const kind = String(request.kind || '')
    const id = String(request.id || '')
    if (!roomKinds.has(kind) || !uuidPattern.test(id)) {
      acknowledge({ ok: false, error: 'INVALID_ROOM' })
      return
    }
    const room = roomName(kind, id)
    if (!socket.data.automaticRooms.has(room)) await socket.leave(room)
    socket.data.explicitRooms.delete(room)
    acknowledge({ ok: true, room })
  })

  socket.emit('connection:ready', {
    userId,
    rooms: [...socket.rooms].filter(room => room !== socket.id)
  })
}
