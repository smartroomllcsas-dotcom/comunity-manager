USE comunity_manager;

INSERT INTO cm_users (id, email, password_hash, name, role, plan)
VALUES (
  UUID(),
  'cliente@comunitymanager.io',
  'Cliente2026!',
  'Cliente Demo',
  'client',
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
WHERE email = 'cliente@comunitymanager.io';
