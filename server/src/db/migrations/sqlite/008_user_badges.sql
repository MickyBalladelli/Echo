-- SQLite / Turso variant of 008_user_badges.sql (no changes needed).

CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_type VARCHAR(16) NOT NULL CHECK (badge_type IN ('verified', 'staff')),
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  PRIMARY KEY (user_id, badge_type)
);

CREATE INDEX IF NOT EXISTS user_badges_active_idx
  ON user_badges (user_id, badge_type)
  WHERE revoked_at IS NULL;
