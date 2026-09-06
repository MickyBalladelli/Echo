-- SQLite / Turso variant of 015_mentions.sql.
-- No-op: the SQLite user_notification_preferences table created in 010
-- already includes 'mention' in its notification_type CHECK, because
-- SQLite cannot DROP/ADD CHECK constraints on existing tables.

SELECT 1;
