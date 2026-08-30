ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING GIN (tags);
CREATE INDEX IF NOT EXISTS notes_owner_updated_idx
  ON notes (user_id, is_pinned DESC, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
