-- SQLite needs a table rebuild to expand the badge type check constraint.
DROP TABLE IF EXISTS user_badges_migration;

CREATE TABLE user_badges_migration (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_type VARCHAR(16) NOT NULL CHECK (badge_type IN ('verified', 'staff', 'government', 'business')),
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  PRIMARY KEY (user_id, badge_type)
);

INSERT INTO user_badges_migration (user_id, badge_type, granted_by, created_at, revoked_at)
SELECT user_id, badge_type, granted_by, created_at, revoked_at
FROM user_badges;

DROP TABLE user_badges;
ALTER TABLE user_badges_migration RENAME TO user_badges;

CREATE INDEX IF NOT EXISTS user_badges_active_idx
  ON user_badges (user_id, badge_type)
  WHERE revoked_at IS NULL;
