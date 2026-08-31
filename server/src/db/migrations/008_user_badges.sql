CREATE TABLE IF NOT EXISTS user_badges (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_type VARCHAR(16) NOT NULL CHECK (badge_type IN ('verified', 'staff')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, badge_type)
);

CREATE INDEX IF NOT EXISTS user_badges_active_idx
  ON user_badges (user_id, badge_type)
  WHERE revoked_at IS NULL;
