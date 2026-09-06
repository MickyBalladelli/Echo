-- SQLite / Turso variant of 005_chat.sql.
-- string_agg() becomes group_concat() over an ordered subquery so the
-- direct_key stays deterministic (member ids sorted ascending).

ALTER TABLE chat_conversations
  ADD COLUMN title VARCHAR(100);

ALTER TABLE chat_conversations
  ADD COLUMN direct_key VARCHAR(73);

ALTER TABLE chat_members
  ADD COLUMN muted_until TEXT;

ALTER TABLE chat_members
  ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE chat_messages
  ADD COLUMN edited_at TEXT;

ALTER TABLE chat_messages
  ADD COLUMN moderation_status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'flagged', 'hidden'));

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS chat_message_reports (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (message_id, reporter_id)
);

UPDATE chat_conversations
SET direct_key = (
  SELECT group_concat(ordered.user_id, ':')
  FROM (
    SELECT member.user_id AS user_id
    FROM chat_members member
    WHERE member.conversation_id = chat_conversations.id AND member.left_at IS NULL
    ORDER BY member.user_id
  ) ordered
  HAVING COUNT(*) = 2
)
WHERE kind = 'direct' AND direct_key IS NULL
  AND (SELECT COUNT(*) FROM chat_members member WHERE member.conversation_id = chat_conversations.id AND member.left_at IS NULL) = 2;

CREATE UNIQUE INDEX IF NOT EXISTS chat_direct_key_unique
  ON chat_conversations (direct_key)
  WHERE kind = 'direct' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id, blocker_id);
CREATE INDEX IF NOT EXISTS chat_reports_created_idx ON chat_message_reports (created_at DESC);
