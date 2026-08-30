ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS title VARCHAR(100),
  ADD COLUMN IF NOT EXISTS direct_key VARCHAR(73);

ALTER TABLE chat_members
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'flagged', 'hidden'));

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS chat_message_reports (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, reporter_id)
);

UPDATE chat_conversations conversation
SET direct_key = members.direct_key
FROM (
  SELECT conversation_id, string_agg(user_id::TEXT, ':' ORDER BY user_id::TEXT) AS direct_key
  FROM chat_members WHERE left_at IS NULL
  GROUP BY conversation_id HAVING COUNT(*) = 2
) members
WHERE conversation.id = members.conversation_id AND conversation.kind = 'direct' AND conversation.direct_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_direct_key_unique
  ON chat_conversations (direct_key)
  WHERE kind = 'direct' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id, blocker_id);
CREATE INDEX IF NOT EXISTS chat_reports_created_idx ON chat_message_reports (created_at DESC);
