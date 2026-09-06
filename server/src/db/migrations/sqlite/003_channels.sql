-- SQLite / Turso variant of 003_channels.sql (no changes needed).

ALTER TABLE channels
  ADD COLUMN image_url TEXT;

CREATE TABLE IF NOT EXISTS channel_invites (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accepted_at TEXT,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS channel_invites_user_idx
  ON channel_invites (user_id, created_at DESC)
  WHERE accepted_at IS NULL;
