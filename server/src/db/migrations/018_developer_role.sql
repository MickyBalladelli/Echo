-- Developers sit above admins. Only application code controls who may remove one.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_global_role_check;
ALTER TABLE users ADD CONSTRAINT users_global_role_check
  CHECK (global_role IN ('user', 'moderator', 'admin', 'developer'));
