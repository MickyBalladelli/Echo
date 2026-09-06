-- SQLite / Turso variant of 011_moderation.sql.
-- SQLite cannot ADD table CHECK constraints to existing tables, so the
-- role/status CHECKs are enforced by application validation instead.
-- The chat_message_reports backfill keeps its ON CONFLICT guard.

ALTER TABLE users
  ADD COLUMN global_role VARCHAR(16) NOT NULL DEFAULT 'user';

ALTER TABLE posts
  ADD COLUMN moderation_status VARCHAR(24) NOT NULL DEFAULT 'active';

ALTER TABLE posts
  ADD COLUMN moderation_removed_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE posts
  ADD COLUMN moderation_removed_at TEXT;

ALTER TABLE posts
  ADD COLUMN moderation_reason VARCHAR(500);

ALTER TABLE chat_messages
  ADD COLUMN moderation_removed_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE chat_messages
  ADD COLUMN moderation_removed_at TEXT;

ALTER TABLE chat_messages
  ADD COLUMN moderation_reason VARCHAR(500);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('post', 'user', 'channel', 'message')),
  target_id TEXT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  resolution_note VARCHAR(500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS moderation_reports_queue_idx
  ON moderation_reports (status, created_at, id);

INSERT INTO moderation_reports (reporter_id, target_type, target_id, reason, created_at, updated_at)
SELECT reporter_id, 'message', message_id, COALESCE(reason, 'Reported from chat'), created_at, created_at
FROM chat_message_reports
ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  appellant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('post', 'user', 'channel', 'message')),
  target_id TEXT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'accepted', 'rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  resolution_note VARCHAR(500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_appeals_active_idx
  ON moderation_appeals (appellant_id, target_type, target_id)
  WHERE status IN ('open', 'reviewing');

CREATE INDEX IF NOT EXISTS moderation_appeals_queue_idx
  ON moderation_appeals (status, created_at, id);

CREATE TABLE IF NOT EXISTS moderation_audit_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  moderator_id TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  report_id TEXT REFERENCES moderation_reports(id) ON DELETE SET NULL,
  appeal_id TEXT REFERENCES moderation_appeals(id) ON DELETE SET NULL,
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('post', 'user', 'channel', 'message')),
  target_id TEXT NOT NULL,
  action VARCHAR(32) NOT NULL,
  previous_state TEXT NOT NULL DEFAULT '{}',
  next_state TEXT NOT NULL DEFAULT '{}',
  note VARCHAR(500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS moderation_audit_target_idx
  ON moderation_audit_logs (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_signals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('spam', 'suspicious_login')),
  action VARCHAR(32) NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS moderation_signals_user_idx
  ON moderation_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_signals_event_idx
  ON moderation_signals (event_type, created_at DESC);
