-- SQLite / Turso variant of 009_channels_depth.sql (no changes needed).

ALTER TABLE channels
  ADD COLUMN rules VARCHAR(2000) NOT NULL DEFAULT '';

ALTER TABLE channels
  ADD COLUMN pinned_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;

ALTER TABLE channels
  ADD COLUMN post_approval_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE channels
  ADD COLUMN discovery_score NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE channel_members
  ADD COLUMN muted_until TEXT;

ALTER TABLE channel_members
  ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE posts
  ADD COLUMN channel_moderation_status VARCHAR(16) NOT NULL DEFAULT 'approved'
    CHECK (channel_moderation_status IN ('approved', 'pending', 'rejected'));

ALTER TABLE posts
  ADD COLUMN channel_moderated_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE posts
  ADD COLUMN channel_moderated_at TEXT;

UPDATE channels
SET discovery_score =
  COALESCE((
    SELECT COUNT(*) * 2
    FROM posts post
    WHERE post.channel_id = channels.id
      AND post.deleted_at IS NULL
      AND post.channel_moderation_status = 'approved'
  ), 0)
  + COALESCE((
    SELECT COUNT(*)
    FROM channel_members member
    WHERE member.channel_id = channels.id AND member.left_at IS NULL
  ), 0);

CREATE INDEX IF NOT EXISTS channels_discovery_idx
  ON channels (discovery_score DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS posts_channel_moderation_idx
  ON posts (channel_id, channel_moderation_status, created_at DESC)
  WHERE deleted_at IS NULL;
