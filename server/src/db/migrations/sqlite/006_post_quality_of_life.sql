-- SQLite / Turso variant of 006_post_quality_of_life.sql.
-- SQLite cannot DROP/ADD table CHECK constraints, so the body-length CHECK
-- evolution (280 chars -> repost-aware) is intentionally not replicated:
-- body length is enforced by application validation. Column types use TEXT
-- affinity, which never truncates, matching the widened PostgreSQL schema.

ALTER TABLE posts
  ADD COLUMN repost_of_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;

ALTER TABLE posts
  ADD COLUMN image_url TEXT;

ALTER TABLE posts
  ADD COLUMN image_alt_text VARCHAR(120);

ALTER TABLE posts
  ADD COLUMN content_warning VARCHAR(120);

ALTER TABLE posts
  ADD COLUMN link_preview TEXT;

CREATE INDEX IF NOT EXISTS posts_repost_idx
  ON posts (repost_of_post_id, created_at DESC)
  WHERE deleted_at IS NULL AND repost_of_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_bookmarks (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_bookmarks_user_idx
  ON post_bookmarks (user_id, created_at DESC, post_id DESC);

CREATE TABLE IF NOT EXISTS post_drafts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  image_url TEXT,
  image_alt_text VARCHAR(120),
  content_warning VARCHAR(120),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS post_drafts_scope_idx
  ON post_drafts (user_id, COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX IF NOT EXISTS post_drafts_user_idx
  ON post_drafts (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS post_edits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  editor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  image_url TEXT,
  image_alt_text VARCHAR(120),
  content_warning VARCHAR(120),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS post_edits_post_idx
  ON post_edits (post_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS hashtags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  tag VARCHAR(64) NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id TEXT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS post_hashtags_hashtag_idx
  ON post_hashtags (hashtag_id, post_id);

ALTER TABLE profiles
  ADD COLUMN pinned_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;
