ALTER TABLE users
  ADD COLUMN IF NOT EXISTS global_role VARCHAR(16) NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_global_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_global_role_check
      CHECK (global_role IN ('user', 'moderator', 'admin'));
  END IF;
END $$;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(24) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS moderation_removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason VARCHAR(500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_moderation_status_check'
  ) THEN
    ALTER TABLE posts ADD CONSTRAINT posts_moderation_status_check
      CHECK (moderation_status IN ('active', 'flagged', 'removed', 'appeal_pending', 'appeal_accepted', 'appeal_rejected'));
  END IF;
END $$;

ALTER TABLE chat_messages
  ALTER COLUMN moderation_status TYPE VARCHAR(24),
  ADD COLUMN IF NOT EXISTS moderation_removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason VARCHAR(500);

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_moderation_status_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_moderation_status_check
  CHECK (moderation_status IN ('active', 'flagged', 'hidden', 'appeal_pending', 'appeal_accepted', 'appeal_rejected'));

CREATE TABLE IF NOT EXISTS moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('post', 'user', 'channel', 'message')),
  target_id UUID NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS moderation_reports_queue_idx
  ON moderation_reports (status, created_at, id);

INSERT INTO moderation_reports (reporter_id, target_type, target_id, reason, created_at, updated_at)
SELECT reporter_id, 'message', message_id, COALESCE(reason, 'Reported from chat'), created_at, created_at
FROM chat_message_reports
ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appellant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('post', 'user', 'channel', 'message')),
  target_id UUID NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'accepted', 'rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_appeals_active_idx
  ON moderation_appeals (appellant_id, target_type, target_id)
  WHERE status IN ('open', 'reviewing');

CREATE INDEX IF NOT EXISTS moderation_appeals_queue_idx
  ON moderation_appeals (status, created_at, id);

CREATE TABLE IF NOT EXISTS moderation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  report_id UUID REFERENCES moderation_reports(id) ON DELETE SET NULL,
  appeal_id UUID REFERENCES moderation_appeals(id) ON DELETE SET NULL,
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('post', 'user', 'channel', 'message')),
  target_id UUID NOT NULL,
  action VARCHAR(32) NOT NULL,
  previous_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  next_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS moderation_audit_target_idx
  ON moderation_audit_logs (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('spam', 'suspicious_login')),
  action VARCHAR(32) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS moderation_signals_user_idx
  ON moderation_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_signals_event_idx
  ON moderation_signals (event_type, created_at DESC);
