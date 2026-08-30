ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_unique
  ON notifications (recipient_id, type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
