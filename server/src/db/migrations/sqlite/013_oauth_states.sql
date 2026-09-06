-- SQLite / Turso variant of 013_oauth_states.sql (no changes needed).

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  provider VARCHAR(32) NOT NULL,
  state_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx
  ON oauth_states (expires_at)
  WHERE consumed_at IS NULL;
