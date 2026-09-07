-- Make the oldest existing account the first admin when no admin exists yet.
UPDATE users
SET global_role = 'admin', updated_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT id
  FROM users
  ORDER BY created_at ASC, id ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM users WHERE global_role = 'admin'
);
