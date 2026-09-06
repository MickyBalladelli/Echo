-- SQLite / Turso variant of 004_notes.sql.
-- The PostgreSQL TEXT[] array plus GIN index has no SQLite equivalent:
-- tags are stored as a JSON TEXT array ('[]' by default) and the app
-- queries them with json_each(). A plain index would not help, so the
-- GIN index is skipped.

ALTER TABLE notes
  ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

ALTER TABLE notes
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS notes_owner_updated_idx
  ON notes (user_id, is_pinned DESC, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
