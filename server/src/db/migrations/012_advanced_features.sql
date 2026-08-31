ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10) NOT NULL DEFAULT 'en'
    CHECK (locale IN ('en', 'fr', 'de', 'es', 'it', 'ja'));

ALTER TABLE posts
  ALTER COLUMN body TYPE TEXT,
  ADD COLUMN IF NOT EXISTS post_format VARCHAR(16) NOT NULL DEFAULT 'short'
    CHECK (post_format IN ('short', 'long'));

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_body_check;

ALTER TABLE posts
  ADD CONSTRAINT posts_body_check
  CHECK (
    char_length(body) BETWEEN 0 AND 20000
    AND (char_length(body) > 0 OR repost_of_post_id IS NOT NULL)
    AND (post_format = 'long' OR char_length(body) <= 280)
  );

ALTER TABLE post_edits
  ALTER COLUMN body TYPE TEXT,
  ADD COLUMN IF NOT EXISTS post_format VARCHAR(16) NOT NULL DEFAULT 'short'
    CHECK (post_format IN ('short', 'long'));

ALTER TABLE post_drafts
  ALTER COLUMN body TYPE TEXT,
  ADD COLUMN IF NOT EXISTS post_format VARCHAR(16) NOT NULL DEFAULT 'short'
    CHECK (post_format IN ('short', 'long'));

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_two_factor (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS two_factor_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'published', 'cancelled', 'failed')),
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  error_message VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question VARCHAR(240) NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  position SMALLINT NOT NULL,
  UNIQUE (poll_id, position),
  UNIQUE (poll_id, label)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id UUID NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS channel_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body VARCHAR(4000) NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  moderation_status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'flagged', 'hidden', 'appeal_accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS channel_chat_read_states (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES channel_chat_messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_name VARCHAR(64) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS two_factor_challenges_expiry_idx
  ON two_factor_challenges (expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS scheduled_posts_due_idx
  ON scheduled_posts (scheduled_at, id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS scheduled_posts_user_idx
  ON scheduled_posts (user_id, scheduled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS poll_votes_option_idx
  ON poll_votes (option_id);
CREATE INDEX IF NOT EXISTS channel_chat_messages_channel_idx
  ON channel_chat_messages (channel_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS analytics_events_user_time_idx
  ON analytics_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_time_idx
  ON analytics_events (event_name, occurred_at DESC);

DROP TRIGGER IF EXISTS user_two_factor_set_updated_at ON user_two_factor;
CREATE TRIGGER user_two_factor_set_updated_at
  BEFORE UPDATE ON user_two_factor
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS oauth_accounts_set_updated_at ON oauth_accounts;
CREATE TRIGGER oauth_accounts_set_updated_at
  BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS scheduled_posts_set_updated_at ON scheduled_posts;
CREATE TRIGGER scheduled_posts_set_updated_at
  BEFORE UPDATE ON scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS channel_chat_messages_set_updated_at ON channel_chat_messages;
CREATE TRIGGER channel_chat_messages_set_updated_at
  BEFORE UPDATE ON channel_chat_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
