-- SQLite / Turso variant of 012_advanced_features.sql.
-- SQLite TEXT affinity never truncates, so the VARCHAR(280) -> TEXT
-- widening of body columns is a no-op here and the ALTER COLUMN TYPE
-- statements are skipped. New tables keep their JSON columns as TEXT.

ALTER TABLE users
  ADD COLUMN email_verified_at TEXT;

ALTER TABLE users
  ADD COLUMN locale VARCHAR(10) NOT NULL DEFAULT 'en'
    CHECK (locale IN ('en', 'fr', 'de', 'es', 'it', 'ja'));

ALTER TABLE posts
  ADD COLUMN post_format VARCHAR(16) NOT NULL DEFAULT 'short'
    CHECK (post_format IN ('short', 'long'));

ALTER TABLE post_edits
  ADD COLUMN post_format VARCHAR(16) NOT NULL DEFAULT 'short'
    CHECK (post_format IN ('short', 'long'));

ALTER TABLE post_drafts
  ADD COLUMN post_format VARCHAR(16) NOT NULL DEFAULT 'short'
    CHECK (post_format IN ('short', 'long'));

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS user_two_factor (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS two_factor_challenges (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  profile TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'published', 'cancelled', 'failed')),
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  error_message VARCHAR(500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS post_polls (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  post_id TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question VARCHAR(240) NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  poll_id TEXT NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  position SMALLINT NOT NULL,
  UNIQUE (poll_id, position),
  UNIQUE (poll_id, label)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS channel_chat_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  moderation_status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'flagged', 'hidden', 'appeal_accepted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS channel_chat_read_states (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id TEXT REFERENCES channel_chat_messages(id) ON DELETE SET NULL,
  last_read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_name VARCHAR(64) NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS two_factor_challenges_expiry_idx
  ON two_factor_challenges (expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS scheduled_posts_due_idx
  ON scheduled_posts (scheduled_at, id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS scheduled_posts_user_idx
  ON scheduled_posts (user_id, scheduled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS poll_votes_option_idx
  ON poll_votes (option_id);
CREATE INDEX IF NOT EXISTS channel_chat_messages_channel_idx
  ON channel_chat_messages (channel_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS analytics_events_user_time_idx
  ON analytics_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_time_idx
  ON analytics_events (event_name, occurred_at DESC);
