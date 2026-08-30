import { DataTypes } from 'sequelize'
import { sequelize } from '../pool.js'

const uuid = {
  type: DataTypes.UUID,
  defaultValue: DataTypes.UUIDV4,
  allowNull: false
}

const timestamps = {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  underscored: true
}

const softDeleteTimestamps = {
  ...timestamps,
  paranoid: true,
  deletedAt: 'deletedAt'
}

export const User = sequelize.define('User', {
  id: { ...uuid, primaryKey: true },
  username: { type: DataTypes.STRING(32), allowNull: false },
  email: { type: DataTypes.STRING(320), allowNull: false },
  passwordHash: { type: DataTypes.TEXT, allowNull: false, field: 'password_hash' },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
  deletedAt: { type: DataTypes.DATE, field: 'deleted_at' }
}, {
  tableName: 'users',
  ...softDeleteTimestamps
})

export const Profile = sequelize.define('Profile', {
  userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'user_id' },
  displayName: { type: DataTypes.STRING(80), allowNull: false, field: 'display_name' },
  bio: { type: DataTypes.STRING(280), allowNull: false, defaultValue: '' },
  avatarUrl: { type: DataTypes.TEXT, field: 'avatar_url' },
  bannerUrl: { type: DataTypes.TEXT, field: 'banner_url' }
}, {
  tableName: 'profiles',
  ...timestamps
})

export const Session = sequelize.define('Session', {
  id: { ...uuid, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  tokenHash: { type: DataTypes.TEXT, allowNull: false, unique: true, field: 'token_hash' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  lastSeenAt: { type: DataTypes.DATE, allowNull: false, field: 'last_seen_at' },
  revokedAt: { type: DataTypes.DATE, field: 'revoked_at' },
  userAgent: { type: DataTypes.TEXT, field: 'user_agent' },
  ipAddress: { type: DataTypes.INET, field: 'ip_address' }
}, {
  tableName: 'sessions',
  ...timestamps,
  updatedAt: false
})

export const Channel = sequelize.define('Channel', {
  id: { ...uuid, primaryKey: true },
  ownerId: { type: DataTypes.UUID, allowNull: false, field: 'owner_id' },
  name: { type: DataTypes.STRING(80), allowNull: false },
  slug: { type: DataTypes.STRING(80), allowNull: false },
  description: { type: DataTypes.STRING(280), allowNull: false, defaultValue: '' },
  imageUrl: { type: DataTypes.TEXT, field: 'image_url' },
  visibility: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'public' },
  deletedAt: { type: DataTypes.DATE, field: 'deleted_at' }
}, {
  tableName: 'channels',
  ...softDeleteTimestamps
})

export const ChannelMember = sequelize.define('ChannelMember', {
  channelId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'channel_id' },
  userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'user_id' },
  role: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'member' },
  joinedAt: { type: DataTypes.DATE, allowNull: false, field: 'joined_at' },
  leftAt: { type: DataTypes.DATE, field: 'left_at' }
}, {
  tableName: 'channel_members',
  timestamps: false
})

export const ChannelInvite = sequelize.define('ChannelInvite', {
  channelId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'channel_id' },
  userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'user_id' },
  invitedBy: { type: DataTypes.UUID, allowNull: false, field: 'invited_by' },
  acceptedAt: { type: DataTypes.DATE, field: 'accepted_at' }
}, {
  tableName: 'channel_invites',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
  underscored: true
})

export const Post = sequelize.define('Post', {
  id: { ...uuid, primaryKey: true },
  authorId: { type: DataTypes.UUID, allowNull: false, field: 'author_id' },
  parentPostId: { type: DataTypes.UUID, field: 'parent_post_id' },
  channelId: { type: DataTypes.UUID, field: 'channel_id' },
  body: { type: DataTypes.STRING(280), allowNull: false },
  visibility: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'public' },
  deletedAt: { type: DataTypes.DATE, field: 'deleted_at' }
}, {
  tableName: 'posts',
  ...softDeleteTimestamps
})

export const PostLike = sequelize.define('PostLike', {
  postId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'post_id' },
  userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'user_id' }
}, {
  tableName: 'post_likes',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
  underscored: true
})

export const Follow = sequelize.define('Follow', {
  followerId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'follower_id' },
  followingId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'following_id' }
}, {
  tableName: 'follows',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
  underscored: true
})

export const Notification = sequelize.define('Notification', {
  id: { ...uuid, primaryKey: true },
  recipientId: { type: DataTypes.UUID, allowNull: false, field: 'recipient_id' },
  actorId: { type: DataTypes.UUID, field: 'actor_id' },
  type: { type: DataTypes.STRING(32), allowNull: false },
  postId: { type: DataTypes.UUID, field: 'post_id' },
  channelId: { type: DataTypes.UUID, field: 'channel_id' },
  conversationId: { type: DataTypes.UUID, field: 'conversation_id' },
  payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  dedupeKey: { type: DataTypes.STRING(255), field: 'dedupe_key' },
  readAt: { type: DataTypes.DATE, field: 'read_at' }
}, {
  tableName: 'notifications',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
  underscored: true
})

export const Note = sequelize.define('Note', {
  id: { ...uuid, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  title: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
  body: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  visibility: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'private' },
  isArchived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_archived' },
  isPinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_pinned' },
  deletedAt: { type: DataTypes.DATE, field: 'deleted_at' }
}, {
  tableName: 'notes',
  ...softDeleteTimestamps
})

export const ChatConversation = sequelize.define('ChatConversation', {
  id: { ...uuid, primaryKey: true },
  createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
  kind: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'direct' },
  deletedAt: { type: DataTypes.DATE, field: 'deleted_at' }
}, {
  tableName: 'chat_conversations',
  ...softDeleteTimestamps
})

export const ChatMember = sequelize.define('ChatMember', {
  conversationId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'conversation_id' },
  userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'user_id' },
  role: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'member' },
  joinedAt: { type: DataTypes.DATE, allowNull: false, field: 'joined_at' },
  leftAt: { type: DataTypes.DATE, field: 'left_at' }
}, {
  tableName: 'chat_members',
  timestamps: false
})

export const ChatMessage = sequelize.define('ChatMessage', {
  id: { ...uuid, primaryKey: true },
  conversationId: { type: DataTypes.UUID, allowNull: false, field: 'conversation_id' },
  senderId: { type: DataTypes.UUID, allowNull: false, field: 'sender_id' },
  body: { type: DataTypes.TEXT, allowNull: false },
  deletedAt: { type: DataTypes.DATE, field: 'deleted_at' }
}, {
  tableName: 'chat_messages',
  ...softDeleteTimestamps
})

export const ChatReadState = sequelize.define('ChatReadState', {
  conversationId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'conversation_id' },
  userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true, field: 'user_id' },
  lastReadMessageId: { type: DataTypes.UUID, field: 'last_read_message_id' },
  lastReadAt: { type: DataTypes.DATE, allowNull: false, field: 'last_read_at' }
}, {
  tableName: 'chat_read_states',
  timestamps: false
})

User.hasOne(Profile, { as: 'profile', foreignKey: 'userId' })
Profile.belongsTo(User, { as: 'user', foreignKey: 'userId' })
User.hasMany(Session, { as: 'sessions', foreignKey: 'userId' })
Session.belongsTo(User, { as: 'user', foreignKey: 'userId' })

User.hasMany(Channel, { as: 'ownedChannels', foreignKey: 'ownerId' })
Channel.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' })
Channel.hasMany(ChannelMember, { as: 'members', foreignKey: 'channelId' })
ChannelMember.belongsTo(Channel, { as: 'channel', foreignKey: 'channelId' })
User.hasMany(ChannelMember, { as: 'channelMemberships', foreignKey: 'userId' })
ChannelMember.belongsTo(User, { as: 'user', foreignKey: 'userId' })
Channel.hasMany(ChannelInvite, { as: 'invites', foreignKey: 'channelId' })
ChannelInvite.belongsTo(Channel, { as: 'channel', foreignKey: 'channelId' })
ChannelInvite.belongsTo(User, { as: 'user', foreignKey: 'userId' })
ChannelInvite.belongsTo(User, { as: 'inviter', foreignKey: 'invitedBy' })

User.hasMany(Post, { as: 'posts', foreignKey: 'authorId' })
Post.belongsTo(User, { as: 'author', foreignKey: 'authorId' })
Post.belongsTo(Post, { as: 'parent', foreignKey: 'parentPostId' })
Post.hasMany(Post, { as: 'replies', foreignKey: 'parentPostId' })
Post.belongsTo(Channel, { as: 'channel', foreignKey: 'channelId' })
Channel.hasMany(Post, { as: 'posts', foreignKey: 'channelId' })
Post.hasMany(PostLike, { as: 'likes', foreignKey: 'postId' })
PostLike.belongsTo(Post, { as: 'post', foreignKey: 'postId' })
User.hasMany(PostLike, { as: 'postLikes', foreignKey: 'userId' })
PostLike.belongsTo(User, { as: 'user', foreignKey: 'userId' })

Follow.belongsTo(User, { as: 'follower', foreignKey: 'followerId' })
Follow.belongsTo(User, { as: 'following', foreignKey: 'followingId' })
User.hasMany(Follow, { as: 'following', foreignKey: 'followerId' })
User.hasMany(Follow, { as: 'followers', foreignKey: 'followingId' })

Notification.belongsTo(User, { as: 'recipient', foreignKey: 'recipientId' })
Notification.belongsTo(User, { as: 'actor', foreignKey: 'actorId' })
Notification.belongsTo(Post, { as: 'post', foreignKey: 'postId' })
Notification.belongsTo(Channel, { as: 'channel', foreignKey: 'channelId' })
Notification.belongsTo(ChatConversation, { as: 'conversation', foreignKey: 'conversationId' })
User.hasMany(Notification, { as: 'notifications', foreignKey: 'recipientId' })

User.hasMany(Note, { as: 'notes', foreignKey: 'userId' })
Note.belongsTo(User, { as: 'user', foreignKey: 'userId' })

User.hasMany(ChatConversation, { as: 'createdConversations', foreignKey: 'createdBy' })
ChatConversation.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' })
ChatConversation.hasMany(ChatMember, { as: 'members', foreignKey: 'conversationId' })
ChatMember.belongsTo(ChatConversation, { as: 'conversation', foreignKey: 'conversationId' })
User.hasMany(ChatMember, { as: 'chatMemberships', foreignKey: 'userId' })
ChatMember.belongsTo(User, { as: 'user', foreignKey: 'userId' })
ChatConversation.hasMany(ChatMessage, { as: 'messages', foreignKey: 'conversationId' })
ChatMessage.belongsTo(ChatConversation, { as: 'conversation', foreignKey: 'conversationId' })
User.hasMany(ChatMessage, { as: 'sentMessages', foreignKey: 'senderId' })
ChatMessage.belongsTo(User, { as: 'sender', foreignKey: 'senderId' })
ChatConversation.hasMany(ChatReadState, { as: 'readStates', foreignKey: 'conversationId' })
ChatReadState.belongsTo(ChatConversation, { as: 'conversation', foreignKey: 'conversationId' })
User.hasMany(ChatReadState, { as: 'chatReadStates', foreignKey: 'userId' })
ChatReadState.belongsTo(User, { as: 'user', foreignKey: 'userId' })
ChatReadState.belongsTo(ChatMessage, { as: 'lastReadMessage', foreignKey: 'lastReadMessageId' })

export const models = Object.freeze({
  User,
  Profile,
  Session,
  Channel,
  ChannelMember,
  ChannelInvite,
  Post,
  PostLike,
  Follow,
  Notification,
  Note,
  ChatConversation,
  ChatMember,
  ChatMessage,
  ChatReadState
})
