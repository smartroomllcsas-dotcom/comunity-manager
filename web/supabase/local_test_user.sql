-- Local test user for development
-- Apply this only in your local database.

INSERT INTO cm_users (email, password_hash, name, role, plan)
VALUES (
  'test@comunitymanager.io',
  'Test2026!',
  'Local Test User',
  'admin',
  'pro'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  plan = 'pro',
  updated_at = now();

-- Verify
SELECT id, email, name, role, plan, created_at
FROM cm_users
WHERE email = 'test@comunitymanager.io';
