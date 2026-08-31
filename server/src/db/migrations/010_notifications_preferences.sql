ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS group_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE notifications
SET expires_at = created_at + INTERVAL '90 days'
WHERE expires_at IS NULL;

ALTER TABLE notifications
  ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_group_idx
  ON notifications (recipient_id, group_key, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notifications_expiration_idx
  ON notifications (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(32) NOT NULL CHECK (notification_type IN (
    'reply', 'like', 'follow', 'channel_invite', 'channel_join', 'channel_post', 'chat_message'
  )),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_type)
);

CREATE TABLE IF NOT EXISTS user_email_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  digest_frequency VARCHAR(16) NOT NULL DEFAULT 'never'
    CHECK (digest_frequency IN ('never', 'daily', 'weekly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS user_notification_preferences_set_updated_at ON user_notification_preferences;
CREATE TRIGGER user_notification_preferences_set_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_email_preferences_set_updated_at ON user_email_preferences;
CREATE TRIGGER user_email_preferences_set_updated_at
  BEFORE UPDATE ON user_email_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
