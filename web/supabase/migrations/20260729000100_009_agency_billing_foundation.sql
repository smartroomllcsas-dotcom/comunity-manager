-- Agency-level billing foundation.
-- This migration is additive and does not enable hard enforcement.
SET search_path TO smarttalk, public, auth, extensions;

-- Plans remain backward compatible with the existing fixed columns while the
-- application transitions to versioned prices and feature entitlements.
ALTER TABLE smarttalk.plans
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE smarttalk.plans
SET code = LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g'))
  || '-' || SUBSTRING(id::TEXT, 1, 8)
WHERE code IS NULL;

ALTER TABLE smarttalk.plans
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT plans_status_check
    CHECK (status IN ('draft', 'active', 'archived'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_code
  ON smarttalk.plans(code);

-- Preserve the existing catalog as visible. Paid plans still cannot be
-- purchased until an active plan_prices row is configured.
UPDATE smarttalk.plans
SET status = 'active',
    is_public = TRUE,
    updated_at = NOW()
WHERE LOWER(name) IN ('free', 'starter', 'professional', 'enterprise');

CREATE TABLE smarttalk.feature_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  limit_type TEXT NOT NULL
    CHECK (limit_type IN ('boolean', 'quantity', 'metered', 'enum')),
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE smarttalk.plan_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES smarttalk.plans(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL REFERENCES smarttalk.feature_catalog(code) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  limit_value BIGINT,
  reset_interval TEXT NOT NULL DEFAULT 'none'
    CHECK (reset_interval IN ('none', 'billing_period', 'day', 'month')),
  overage_policy TEXT NOT NULL DEFAULT 'block'
    CHECK (overage_policy IN ('block', 'allow', 'notify')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, feature_code),
  CHECK (limit_value IS NULL OR limit_value >= 0)
);

CREATE TABLE smarttalk.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES smarttalk.plans(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  billing_interval TEXT NOT NULL DEFAULT 'month'
    CHECK (billing_interval IN ('month', 'year')),
  interval_count INT NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  provider TEXT NOT NULL DEFAULT 'epayco',
  provider_plan_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  active_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (active_to IS NULL OR active_to > active_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_prices_active
  ON smarttalk.plan_prices(plan_id, currency, billing_interval, interval_count)
  WHERE is_active = TRUE AND active_to IS NULL;

UPDATE smarttalk.organizations
SET plan_id = (
  SELECT id
  FROM smarttalk.plans
  WHERE LOWER(name) = 'free'
  ORDER BY created_at
  LIMIT 1
)
WHERE plan_id IS NULL
  AND EXISTS (SELECT 1 FROM smarttalk.plans WHERE LOWER(name) = 'free');

ALTER TABLE smarttalk.organizations
  ADD COLUMN IF NOT EXISTS billing_enforcement_mode TEXT NOT NULL DEFAULT 'observe',
  ADD CONSTRAINT organizations_billing_enforcement_mode_check
    CHECK (billing_enforcement_mode IN ('off', 'observe', 'soft', 'hard'));

-- Existing subscription records are extended instead of replaced.
ALTER TABLE smarttalk.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'epayco',
  ADD COLUMN IF NOT EXISTS plan_price_id UUID REFERENCES smarttalk.plan_prices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_current_per_org
  ON smarttalk.subscriptions(organization_id)
  WHERE status IN ('trial', 'active', 'past_due', 'suspended');

CREATE TABLE smarttalk.checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_reference TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES smarttalk.organizations(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES smarttalk.plans(id) ON DELETE RESTRICT,
  plan_price_id UUID NOT NULL REFERENCES smarttalk.plan_prices(id) ON DELETE RESTRICT,
  initiated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'epayco',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'failed', 'expired', 'cancelled')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_org_created
  ON smarttalk.checkout_sessions(organization_id, created_at DESC);

ALTER TABLE smarttalk.payments
  ADD COLUMN IF NOT EXISTS checkout_session_id UUID REFERENCES smarttalk.checkout_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'epayco',
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_transaction
  ON smarttalk.payments(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_epayco_ref
  ON smarttalk.payments(epayco_ref)
  WHERE epayco_ref IS NOT NULL;

CREATE TABLE smarttalk.billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count INT NOT NULL DEFAULT 1,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, event_key)
);

CREATE TABLE smarttalk.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES smarttalk.subscriptions(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES smarttalk.organizations(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'provider', 'user', 'admin')),
  actor_id UUID,
  correlation_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_org_created
  ON smarttalk.subscription_events(organization_id, created_at DESC);

CREATE TABLE smarttalk.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL REFERENCES smarttalk.feature_catalog(code) ON DELETE RESTRICT,
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, feature_code, idempotency_key),
  CHECK (period_end > period_start)
);

CREATE TABLE smarttalk.usage_counters (
  organization_id UUID NOT NULL REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL REFERENCES smarttalk.feature_catalog(code) ON DELETE RESTRICT,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(organization_id, feature_code, period_start),
  CHECK (period_end > period_start)
);

CREATE TABLE smarttalk.billing_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL REFERENCES smarttalk.feature_catalog(code) ON DELETE RESTRICT,
  enforcement_mode TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  would_block BOOLEAN NOT NULL,
  requested_units BIGINT NOT NULL DEFAULT 1,
  current_usage BIGINT,
  limit_value BIGINT,
  reason TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_decisions_org_created
  ON smarttalk.billing_decision_events(organization_id, created_at DESC);

-- Initial catalog. Limits that were not already part of the product are not
-- invented here; administrators must configure them before hard enforcement.
INSERT INTO smarttalk.feature_catalog(code, name, description, limit_type, unit) VALUES
  ('team.members', 'Miembros del equipo', 'Usuarios activos dentro de la agencia', 'quantity', 'members'),
  ('brands.total', 'Marcas administradas', 'Clientes o marcas vinculados a la agencia', 'quantity', 'brands'),
  ('channels.active', 'Canales activos', 'Canales sociales activos de la agencia', 'quantity', 'channels'),
  ('contacts.total', 'Contactos', 'Contactos almacenados por la agencia', 'quantity', 'contacts'),
  ('messages.outbound_month', 'Mensajes salientes', 'Mensajes enviados durante el periodo', 'metered', 'messages'),
  ('broadcasts.month', 'Difusiones', 'Difusiones iniciadas durante el periodo', 'metered', 'broadcasts'),
  ('posts.month', 'Publicaciones', 'Publicaciones sociales durante el periodo', 'metered', 'posts'),
  ('automations.flows', 'Flujos de automatizacion', 'Flujos de chatbot de la agencia', 'quantity', 'flows'),
  ('ai.access', 'Acceso a IA', 'Uso de asistencia y agentes de IA', 'boolean', NULL),
  ('ai.requests_month', 'Solicitudes de IA', 'Solicitudes de IA durante el periodo', 'metered', 'requests'),
  ('reports.access', 'Acceso a reportes', 'Modulo de reportes', 'boolean', NULL),
  ('storage.bytes', 'Almacenamiento', 'Bytes almacenados por la agencia', 'metered', 'bytes')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  limit_type = EXCLUDED.limit_type,
  unit = EXCLUDED.unit,
  updated_at = NOW();

-- Preserve the limits already represented by legacy plan columns.
INSERT INTO smarttalk.plan_entitlements(plan_id, feature_code, enabled, limit_value, reset_interval)
SELECT id, 'team.members', TRUE, NULLIF(max_agents, -1), 'none'
FROM smarttalk.plans
ON CONFLICT (plan_id, feature_code) DO NOTHING;

INSERT INTO smarttalk.plan_entitlements(plan_id, feature_code, enabled, limit_value, reset_interval)
SELECT id, 'contacts.total', TRUE, NULLIF(max_contacts, -1), 'none'
FROM smarttalk.plans
ON CONFLICT (plan_id, feature_code) DO NOTHING;

INSERT INTO smarttalk.plan_entitlements(plan_id, feature_code, enabled, limit_value, reset_interval)
SELECT id, 'broadcasts.month', TRUE, NULLIF(max_broadcasts_per_month, -1), 'billing_period'
FROM smarttalk.plans
ON CONFLICT (plan_id, feature_code) DO NOTHING;

INSERT INTO smarttalk.plan_entitlements(plan_id, feature_code, enabled, limit_value, reset_interval)
SELECT id, 'automations.flows', TRUE, NULLIF(max_chatbot_flows, -1), 'none'
FROM smarttalk.plans
ON CONFLICT (plan_id, feature_code) DO NOTHING;

INSERT INTO smarttalk.plan_entitlements(plan_id, feature_code, enabled, limit_value, reset_interval)
SELECT id, 'ai.access', ai_enabled, NULL, 'none'
FROM smarttalk.plans
ON CONFLICT (plan_id, feature_code) DO NOTHING;

-- Atomic, idempotent usage recording. Only server-side service-role calls may
-- execute this function.
CREATE OR REPLACE FUNCTION smarttalk.record_billing_usage(
  p_organization_id UUID,
  p_feature_code TEXT,
  p_quantity BIGINT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_idempotency_key TEXT,
  p_source_type TEXT DEFAULT NULL,
  p_source_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $$
DECLARE
  inserted_id UUID;
BEGIN
  IF p_quantity <= 0 OR p_period_end <= p_period_start THEN
    RAISE EXCEPTION 'Invalid billing usage input';
  END IF;

  INSERT INTO smarttalk.usage_events(
    organization_id,
    feature_code,
    quantity,
    period_start,
    period_end,
    idempotency_key,
    source_type,
    source_id,
    metadata
  )
  VALUES (
    p_organization_id,
    p_feature_code,
    p_quantity,
    p_period_start,
    p_period_end,
    p_idempotency_key,
    p_source_type,
    p_source_id,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  ON CONFLICT (organization_id, feature_code, idempotency_key) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO smarttalk.usage_counters(
    organization_id,
    feature_code,
    period_start,
    period_end,
    quantity
  )
  VALUES (
    p_organization_id,
    p_feature_code,
    p_period_start,
    p_period_end,
    p_quantity
  )
  ON CONFLICT (organization_id, feature_code, period_start)
  DO UPDATE SET
    quantity = smarttalk.usage_counters.quantity + EXCLUDED.quantity,
    period_end = EXCLUDED.period_end,
    updated_at = NOW();

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION smarttalk.record_billing_usage(
  UUID, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION smarttalk.record_billing_usage(
  UUID, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB
) TO service_role;

-- Billing writes are server-only. Organization members may read their own
-- commercial state but cannot mutate it through the browser.
DROP POLICY IF EXISTS "subscriptions_own_org" ON smarttalk.subscriptions;
DROP POLICY IF EXISTS "payments_own_org" ON smarttalk.payments;
DROP POLICY IF EXISTS "usage_own_org" ON smarttalk.usage_records;

CREATE POLICY "subscriptions_read_own_org"
  ON smarttalk.subscriptions FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE POLICY "payments_read_own_org"
  ON smarttalk.payments FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE POLICY "usage_records_read_own_org"
  ON smarttalk.usage_records FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

ALTER TABLE smarttalk.feature_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.billing_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.billing_decision_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_catalog_read_authenticated"
  ON smarttalk.feature_catalog FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "plan_entitlements_read_authenticated"
  ON smarttalk.plan_entitlements FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "plan_prices_read_authenticated"
  ON smarttalk.plan_prices FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = TRUE);

CREATE POLICY "checkout_sessions_read_own_org"
  ON smarttalk.checkout_sessions FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE POLICY "subscription_events_read_own_org"
  ON smarttalk.subscription_events FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE POLICY "usage_events_read_own_org"
  ON smarttalk.usage_events FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE POLICY "usage_counters_read_own_org"
  ON smarttalk.usage_counters FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE POLICY "billing_decisions_read_own_org"
  ON smarttalk.billing_decision_events FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON smarttalk.plans
  FOR EACH ROW EXECUTE FUNCTION smarttalk.update_updated_at();

CREATE TRIGGER plan_entitlements_updated_at
  BEFORE UPDATE ON smarttalk.plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION smarttalk.update_updated_at();

CREATE TRIGGER plan_prices_updated_at
  BEFORE UPDATE ON smarttalk.plan_prices
  FOR EACH ROW EXECUTE FUNCTION smarttalk.update_updated_at();

CREATE TRIGGER checkout_sessions_updated_at
  BEFORE UPDATE ON smarttalk.checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION smarttalk.update_updated_at();

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON smarttalk.payments
  FOR EACH ROW EXECUTE FUNCTION smarttalk.update_updated_at();

CREATE TRIGGER billing_webhook_events_updated_at
  BEFORE UPDATE ON smarttalk.billing_webhook_events
  FOR EACH ROW EXECUTE FUNCTION smarttalk.update_updated_at();
