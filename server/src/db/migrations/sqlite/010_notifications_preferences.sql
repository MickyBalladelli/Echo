-- SQLite / Turso variant of 010_notifications_preferences.sql.
-- SQLite cannot ALTER a column to add a NOT NULL constraint or an
-- expression DEFAULT, so notifications.group_key / expires_at are created
-- in 001 already with their final shape; this file keeps the backfill,
-- indexes and preference tables. The notification_type CHECK includes
-- 'mention' directly (015 is a no-op on SQLite).

UPDATE notifications
SET expires_at = datetime(created_at, '+90 days')
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_group_idx
  ON notifications (recipient_id, group_key, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notifications_expiration_idx
  ON notifications (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(32) NOT NULL CHECK (notification_type IN (
    'reply', 'like', 'follow', 'channel_invite', 'channel_join', 'channel_post', 'chat_message', 'mention'
  )),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, notification_type)
);

CREATE TABLE IF NOT EXISTS user_email_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  digest_frequency VARCHAR(16) NOT NULL DEFAULT 'never'
    CHECK (digest_frequency IN ('never', 'daily', 'weekly')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
