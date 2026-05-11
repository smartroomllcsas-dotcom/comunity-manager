USE comunity_manager;

INSERT INTO cm_users (id, email, password_hash, name, role, plan)
VALUES (
  UUID(),
  'test@comunitymanager.io',
  'Test2026!',
  'Local Test User',
  'admin',
  'pro'
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  name = VALUES(name),
  role = VALUES(role),
  plan = VALUES(plan),
  updated_at = CURRENT_TIMESTAMP;

SELECT id, email, name, role, plan, created_at
FROM cm_users
WHERE email = 'test@comunitymanager.io';
