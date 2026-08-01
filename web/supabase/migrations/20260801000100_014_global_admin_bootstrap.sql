-- Global platform administrator bootstrap.
-- The allowlist is intentionally small and auditable. It does not grant
-- access to any other email address.
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.agents
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS smarttalk.platform_admin_allowlist (
  email TEXT PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO smarttalk.platform_admin_allowlist(email, is_active)
VALUES ('leonelzc2005@gmail.com', TRUE)
ON CONFLICT (email) DO UPDATE SET is_active = TRUE;

CREATE OR REPLACE FUNCTION smarttalk.apply_platform_admin_allowlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM smarttalk.platform_admin_allowlist
    WHERE lower(email) = lower(NEW.email)
      AND is_active = TRUE
  ) THEN
    NEW.is_super_admin := TRUE;
    NEW.role := 'admin';
    NEW.member_type := 'agency_user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_platform_admin_allowlist ON smarttalk.agents;
CREATE TRIGGER apply_platform_admin_allowlist
  BEFORE INSERT OR UPDATE OF email ON smarttalk.agents
  FOR EACH ROW
  EXECUTE FUNCTION smarttalk.apply_platform_admin_allowlist();

UPDATE smarttalk.agents AS agent
SET is_super_admin = TRUE,
    role = 'admin',
    member_type = 'agency_user'
FROM smarttalk.platform_admin_allowlist AS allowlist
WHERE lower(agent.email) = lower(allowlist.email)
  AND allowlist.is_active = TRUE;

CREATE OR REPLACE FUNCTION smarttalk.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM smarttalk.agents
    WHERE id = auth.uid()
      AND is_super_admin = TRUE
  );
$$;

-- Existing admin screens use authenticated reads for their tables. This
-- policy lets only the global administrator review and manage all tenants;
-- normal organization policies remain unchanged.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations',
    'agents',
    'contacts',
    'conversations',
    'messages',
    'channels',
    'subscriptions',
    'payments',
    'usage_records',
    'checkout_sessions',
    'billing_webhook_events',
    'subscription_events',
    'billing_audit_events',
    'billing_decision_events',
    'plans',
    'plan_entitlements',
    'plan_prices',
    'feature_catalog',
    'payment_gateway_settings'
  ] LOOP
    IF to_regclass('smarttalk.' || table_name) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_policies
         WHERE schemaname = 'smarttalk'
           AND tablename = table_name
           AND policyname = 'super_admin_full_access'
       ) THEN
      EXECUTE format(
        'CREATE POLICY super_admin_full_access ON smarttalk.%I FOR ALL USING (smarttalk.is_super_admin()) WITH CHECK (smarttalk.is_super_admin())',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON TABLE smarttalk.platform_admin_allowlist IS
  'Explicit email allowlist for global platform administrators.';
