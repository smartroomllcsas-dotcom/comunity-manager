-- Admin user for development / programmer access
-- Run this in Supabase SQL Editor

INSERT INTO cm_users (email, password_hash, name, role, plan)
VALUES (
  'dev@comunitymanager.io',
  'Dev2026Admin!',
  'Developer Admin',
  'admin',
  'pro'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  plan = 'pro',
  updated_at = now();

-- Verify
SELECT id, email, name, role, plan, created_at FROM cm_users WHERE email = 'dev@comunitymanager.io';
