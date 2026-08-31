ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS repost_of_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_alt_text VARCHAR(120),
  ADD COLUMN IF NOT EXISTS content_warning VARCHAR(120),
  ADD COLUMN IF NOT EXISTS link_preview JSONB;

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_body_check;

ALTER TABLE posts
  ADD CONSTRAINT posts_body_check
  CHECK (
    char_length(body) BETWEEN 0 AND 280
    AND (char_length(body) > 0 OR repost_of_post_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS posts_repost_idx
  ON posts (repost_of_post_id, created_at DESC)
  WHERE deleted_at IS NULL AND repost_of_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_bookmarks (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_bookmarks_user_idx
  ON post_bookmarks (user_id, created_at DESC, post_id DESC);

CREATE TABLE IF NOT EXISTS post_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  body VARCHAR(280) NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  image_url TEXT,
  image_alt_text VARCHAR(120),
  content_warning VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS post_drafts_scope_idx
  ON post_drafts (user_id, COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::UUID));

CREATE INDEX IF NOT EXISTS post_drafts_user_idx
  ON post_drafts (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS post_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  editor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body VARCHAR(280) NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  image_url TEXT,
  image_alt_text VARCHAR(120),
  content_warning VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS post_edits_post_idx
  ON post_edits (post_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS post_hashtags_hashtag_idx
  ON post_hashtags (hashtag_id, post_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pinned_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS post_drafts_set_updated_at ON post_drafts;
CREATE TRIGGER post_drafts_set_updated_at
  BEFORE UPDATE ON post_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
