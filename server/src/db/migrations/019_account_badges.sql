-- Add public account badges managed by admins and developers.
ALTER TABLE user_badges DROP CONSTRAINT IF EXISTS user_badges_badge_type_check;
ALTER TABLE user_badges ADD CONSTRAINT user_badges_badge_type_check
  CHECK (badge_type IN ('verified', 'staff', 'government', 'business'));
