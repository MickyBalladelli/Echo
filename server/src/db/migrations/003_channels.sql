ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS channel_invites (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS channel_invites_user_idx
  ON channel_invites (user_id, created_at DESC)
  WHERE accepted_at IS NULL;
