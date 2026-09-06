-- SQLite / Turso (libSQL) variant of 001_initial_schema.sql.
-- Differences from PostgreSQL are intentional and documented here:
-- * No pgcrypto extension: UUID defaults use an inline v4 expression.
-- * TIMESTAMPTZ is stored as TEXT in ISO-8601 UTC form (strftime with
--   milliseconds + Z), matching the format the app writes from JavaScript.
-- * INET / JSONB are stored as TEXT. Length CHECKs on post bodies are left
--   to application validation because SQLite cannot ALTER CHECK constraints.
-- * updated_at is maintained by the application (every UPDATE in the app
--   sets it explicitly); no set_updated_at() trigger function exists here.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  username VARCHAR(32) NOT NULL,
  email VARCHAR(320) NOT NULL,
  password_hash TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(80) NOT NULL,
  bio VARCHAR(280) NOT NULL DEFAULT '',
  avatar_url TEXT,
  banner_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  user_agent TEXT,
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  description VARCHAR(280) NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  left_at TEXT,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  body VARCHAR(280) NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind VARCHAR(16) NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  left_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_read_states (
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  last_read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(32) NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES chat_conversations(id) ON DELETE CASCADE,
  payload TEXT NOT NULL DEFAULT '{}',
  group_key VARCHAR(255),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+90 days')),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_active_unique
  ON users (LOWER(username))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_unique
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channels_slug_active_unique
  ON channels (LOWER(slug))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_user_idx
  ON sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_expiry_idx
  ON sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_feed_idx
  ON posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_author_idx
  ON posts (author_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_parent_idx
  ON posts (parent_post_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_channel_idx
  ON posts (channel_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS post_likes_user_idx
  ON post_likes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS follows_follower_idx
  ON follows (follower_id, created_at DESC);

CREATE INDEX IF NOT EXISTS follows_following_idx
  ON follows (following_id, created_at DESC);

CREATE INDEX IF NOT EXISTS channels_owner_idx
  ON channels (owner_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS channels_discovery_idx
  ON channels (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND visibility = 'public';

CREATE INDEX IF NOT EXISTS channel_members_user_idx
  ON channel_members (user_id, joined_at DESC)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications (recipient_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (recipient_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notes_user_idx
  ON notes (user_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_conversations_activity_idx
  ON chat_conversations (updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_members_user_idx
  ON chat_members (user_id, joined_at DESC)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON chat_messages (conversation_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_messages_sender_idx
  ON chat_messages (sender_id, created_at DESC)
  WHERE deleted_at IS NULL;
