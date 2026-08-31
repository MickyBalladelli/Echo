ALTER TABLE channel_chat_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE channel_chat_messages
  DROP CONSTRAINT IF EXISTS channel_chat_messages_body_check;

ALTER TABLE channel_chat_messages
  ADD CONSTRAINT channel_chat_messages_body_check
  CHECK (
    char_length(body) BETWEEN 0 AND 4000
    AND (char_length(body) > 0 OR jsonb_array_length(attachments) > 0)
  );
