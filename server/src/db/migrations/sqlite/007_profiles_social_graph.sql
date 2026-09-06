-- SQLite / Turso variant of 007_profiles_social_graph.sql (no changes needed).

ALTER TABLE profiles
  ADD COLUMN profile_visibility VARCHAR(16) NOT NULL DEFAULT 'public'
    CHECK (profile_visibility IN ('public', 'followers'));

ALTER TABLE profiles
  ADD COLUMN show_followers BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE profiles
  ADD COLUMN show_following BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_mutes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, muted_user_id),
  CHECK (user_id <> muted_user_id)
);

CREATE TABLE IF NOT EXISTS user_restrictions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restricted_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, restricted_user_id),
  CHECK (user_id <> restricted_user_id)
);

CREATE INDEX IF NOT EXISTS user_mutes_target_idx ON user_mutes (muted_user_id, user_id);
CREATE INDEX IF NOT EXISTS user_restrictions_target_idx ON user_restrictions (restricted_user_id, user_id);
