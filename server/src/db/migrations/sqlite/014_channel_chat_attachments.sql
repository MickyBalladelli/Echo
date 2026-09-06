-- SQLite / Turso variant of 014_channel_chat_attachments.sql.
-- SQLite cannot redefine the body CHECK constraint, so the relaxed rule
-- (empty body allowed with attachments) is enforced by application
-- validation; jsonb_array_length() becomes json_array_length().

ALTER TABLE channel_chat_messages
  ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
