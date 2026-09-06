ALTER TABLE channel_chat_messages
  ADD COLUMN reactions TEXT NOT NULL DEFAULT '[]';
