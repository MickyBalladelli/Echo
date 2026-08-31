ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS rules VARCHAR(2000) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pinned_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS post_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS discovery_score NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE channel_members
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS channel_moderation_status VARCHAR(16) NOT NULL DEFAULT 'approved'
    CHECK (channel_moderation_status IN ('approved', 'pending', 'rejected')),
  ADD COLUMN IF NOT EXISTS channel_moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_moderated_at TIMESTAMPTZ;

UPDATE channels channel
SET discovery_score =
  COALESCE((
    SELECT COUNT(*) * 2
    FROM posts post
    WHERE post.channel_id = channel.id
      AND post.deleted_at IS NULL
      AND post.channel_moderation_status = 'approved'
  ), 0)
  + COALESCE((
    SELECT COUNT(*)
    FROM channel_members member
    WHERE member.channel_id = channel.id AND member.left_at IS NULL
  ), 0);

CREATE INDEX IF NOT EXISTS channels_discovery_idx
  ON channels (discovery_score DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS posts_channel_moderation_idx
  ON posts (channel_id, channel_moderation_status, created_at DESC)
  WHERE deleted_at IS NULL;
