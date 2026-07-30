-- Public commercial onboarding metadata.
-- Additive only: no existing channel, message, user or subscription is changed.
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.organizations
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone TEXT,
  ADD COLUMN IF NOT EXISTS billing_country_code TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_plan_id UUID
    REFERENCES smarttalk.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_started';

ALTER TABLE smarttalk.organizations
  DROP CONSTRAINT IF EXISTS organizations_billing_country_code_check;
ALTER TABLE smarttalk.organizations
  ADD CONSTRAINT organizations_billing_country_code_check
    CHECK (
      billing_country_code IS NULL
      OR billing_country_code ~ '^[A-Z]{2}$'
    );

ALTER TABLE smarttalk.organizations
  DROP CONSTRAINT IF EXISTS organizations_onboarding_status_check;
ALTER TABLE smarttalk.organizations
  ADD CONSTRAINT organizations_onboarding_status_check
    CHECK (onboarding_status IN (
      'not_started',
      'pending_payment',
      'checkout_started',
      'active',
      'payment_rejected',
      'payment_failed',
      'payment_expired',
      'cancelled'
    ));

CREATE INDEX IF NOT EXISTS idx_organizations_onboarding
  ON smarttalk.organizations(onboarding_status, onboarding_plan_id)
  WHERE onboarding_status <> 'not_started';

CREATE OR REPLACE FUNCTION smarttalk.sync_checkout_onboarding_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE smarttalk.organizations
    SET onboarding_status = 'checkout_started'
    WHERE id = NEW.organization_id
      AND onboarding_plan_id = NEW.plan_id
      AND onboarding_status IN ('pending_payment', 'payment_rejected', 'payment_failed', 'payment_expired');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE smarttalk.organizations
    SET onboarding_status = CASE NEW.status
      WHEN 'approved' THEN 'active'
      WHEN 'rejected' THEN 'payment_rejected'
      WHEN 'failed' THEN 'payment_failed'
      WHEN 'expired' THEN 'payment_expired'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE onboarding_status
    END
    WHERE id = NEW.organization_id
      AND onboarding_plan_id = NEW.plan_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_checkout_onboarding_status
  ON smarttalk.checkout_sessions;
CREATE TRIGGER sync_checkout_onboarding_status
  AFTER INSERT OR UPDATE OF status ON smarttalk.checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION smarttalk.sync_checkout_onboarding_status();

REVOKE ALL ON FUNCTION smarttalk.sync_checkout_onboarding_status()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION smarttalk.sync_checkout_onboarding_status()
  TO service_role;

INSERT INTO smarttalk.billing_audit_events(
  actor_type,
  action,
  entity_type,
  entity_id,
  correlation_id,
  after_data,
  result
) VALUES (
  'system',
  'migration.public_plan_onboarding_applied',
  'migration',
  '20260730000200_012_public_plan_onboarding',
  gen_random_uuid(),
  jsonb_build_object(
    'activation_requires_approved_payment', TRUE,
    'existing_organizations_modified', FALSE
  ),
  'success'
);
