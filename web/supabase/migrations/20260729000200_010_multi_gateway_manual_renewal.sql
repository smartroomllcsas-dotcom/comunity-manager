-- Multi-gateway billing architecture.
-- Requires: 20260729000100_009_agency_billing_foundation.sql
-- Safe default: manual renewals, ePayco checkout enabled, Wompi/PayU disabled.
-- No provider secrets are stored in PostgreSQL.
SET search_path TO smarttalk, public, auth, extensions;

CREATE TABLE smarttalk.payment_gateway_settings (
  gateway TEXT PRIMARY KEY
    CHECK (gateway IN ('epayco', 'wompi', 'payu')),
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  checkout_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  environment TEXT NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox', 'production')),
  renewal_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (renewal_mode IN ('manual', 'automatic')),
  supports_payment_sources BOOLEAN NOT NULL DEFAULT FALSE,
  supports_automatic_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  priority INT NOT NULL DEFAULT 100 CHECK (priority >= 0),
  metadata JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (renewal_mode <> 'automatic' OR supports_automatic_renewal = TRUE),
  CHECK (checkout_enabled = FALSE OR is_enabled = TRUE)
);

INSERT INTO smarttalk.payment_gateway_settings(
  gateway,
  display_name,
  is_enabled,
  checkout_enabled,
  environment,
  renewal_mode,
  supports_payment_sources,
  supports_automatic_renewal,
  priority
) VALUES
  ('epayco', 'ePayco', TRUE, TRUE, 'sandbox', 'manual', TRUE, TRUE, 10),
  ('wompi', 'Wompi', FALSE, FALSE, 'sandbox', 'manual', TRUE, TRUE, 20),
  ('payu', 'PayU', FALSE, FALSE, 'sandbox', 'manual', TRUE, TRUE, 30)
ON CONFLICT (gateway) DO NOTHING;

ALTER TABLE smarttalk.plan_prices
  ADD CONSTRAINT plan_prices_provider_fk
    FOREIGN KEY (provider)
    REFERENCES smarttalk.payment_gateway_settings(gateway)
    ON DELETE RESTRICT;

-- Each provider can have an active price for the same plan and currency.
DROP INDEX IF EXISTS smarttalk.idx_plan_prices_active;
CREATE UNIQUE INDEX idx_plan_prices_active
  ON smarttalk.plan_prices(
    plan_id,
    currency,
    billing_interval,
    interval_count,
    provider
  )
  WHERE is_active = TRUE AND active_to IS NULL;

CREATE INDEX idx_plan_prices_provider_active
  ON smarttalk.plan_prices(provider, is_active, currency);

ALTER TABLE smarttalk.organizations
  ADD COLUMN IF NOT EXISTS preferred_payment_gateway TEXT
    CHECK (preferred_payment_gateway IN ('epayco', 'wompi', 'payu')),
  ADD COLUMN IF NOT EXISTS renewal_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (renewal_mode IN ('manual', 'automatic'));

ALTER TABLE smarttalk.subscriptions
  ADD COLUMN IF NOT EXISTS renewal_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (renewal_mode IN ('manual', 'automatic')),
  ADD COLUMN IF NOT EXISTS preferred_gateway TEXT
    CHECK (preferred_gateway IN ('epayco', 'wompi', 'payu')),
  ADD COLUMN IF NOT EXISTS provider_payment_source_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_source_status TEXT
    CHECK (payment_source_status IN ('pending', 'available', 'unavailable', 'revoked')),
  ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_payment_attempts INT NOT NULL DEFAULT 0
    CHECK (failed_payment_attempts >= 0),
  ADD COLUMN IF NOT EXISTS pending_plan_id UUID
    REFERENCES smarttalk.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_plan_price_id UUID
    REFERENCES smarttalk.plan_prices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change_effective_at TIMESTAMPTZ;

ALTER TABLE smarttalk.subscriptions
  ADD CONSTRAINT subscriptions_provider_fk
    FOREIGN KEY (provider)
    REFERENCES smarttalk.payment_gateway_settings(gateway)
    ON DELETE RESTRICT;

CREATE INDEX idx_subscriptions_next_billing
  ON smarttalk.subscriptions(status, next_billing_at)
  WHERE renewal_mode = 'automatic' AND next_billing_at IS NOT NULL;

ALTER TABLE smarttalk.checkout_sessions
  ADD COLUMN IF NOT EXISTS environment TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'initial'
    CHECK (purpose IN ('initial', 'renewal', 'upgrade', 'reactivation', 'manual'));

ALTER TABLE smarttalk.checkout_sessions
  ADD CONSTRAINT checkout_sessions_provider_fk
    FOREIGN KEY (provider)
    REFERENCES smarttalk.payment_gateway_settings(gateway)
    ON DELETE RESTRICT;

UPDATE smarttalk.checkout_sessions
SET environment = CASE WHEN test_mode THEN 'sandbox' ELSE 'production' END
WHERE environment IS NULL;

ALTER TABLE smarttalk.checkout_sessions
  ALTER COLUMN environment SET NOT NULL,
  ADD CONSTRAINT checkout_sessions_environment_check
    CHECK (environment IN ('sandbox', 'production'));

CREATE UNIQUE INDEX idx_checkout_sessions_org_idempotency
  ON smarttalk.checkout_sessions(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE smarttalk.payments
  ADD COLUMN IF NOT EXISTS environment TEXT,
  ADD COLUMN IF NOT EXISTS merchant_reference TEXT,
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'initial'
    CHECK (purpose IN ('initial', 'renewal', 'upgrade', 'reactivation', 'manual')),
  ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1
    CHECK (attempt_number > 0),
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_message TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_amount_minor BIGINT NOT NULL DEFAULT 0
    CHECK (refunded_amount_minor >= 0);

ALTER TABLE smarttalk.payments
  ADD CONSTRAINT payments_provider_fk
    FOREIGN KEY (provider)
    REFERENCES smarttalk.payment_gateway_settings(gateway)
    ON DELETE RESTRICT;

UPDATE smarttalk.payments
SET environment = CASE WHEN test_mode THEN 'sandbox' ELSE 'production' END,
    merchant_reference = COALESCE(epayco_ref, provider_transaction_id, id::TEXT),
    amount_minor = ROUND(amount * 100)
WHERE environment IS NULL
   OR merchant_reference IS NULL
   OR amount_minor IS NULL;

ALTER TABLE smarttalk.payments
  ALTER COLUMN environment SET NOT NULL,
  ALTER COLUMN merchant_reference SET NOT NULL,
  ALTER COLUMN amount_minor SET NOT NULL,
  ADD CONSTRAINT payments_environment_check
    CHECK (environment IN ('sandbox', 'production')),
  ADD CONSTRAINT payments_amount_minor_check
    CHECK (amount_minor > 0),
  ADD CONSTRAINT payments_refund_amount_check
    CHECK (refunded_amount_minor <= amount_minor);

CREATE UNIQUE INDEX idx_payments_merchant_attempt
  ON smarttalk.payments(
    provider,
    environment,
    merchant_reference,
    attempt_number
  );

DROP INDEX IF EXISTS smarttalk.idx_payments_provider_transaction;
CREATE UNIQUE INDEX idx_payments_provider_environment_transaction
  ON smarttalk.payments(provider, environment, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- Finalize an approved ePayco checkout in one database transaction. The
-- checkout row is locked first, making retries safe after partial network or
-- function failures.
CREATE OR REPLACE FUNCTION smarttalk.finalize_epayco_approved_payment(
  p_checkout_session_id UUID,
  p_payment_id UUID,
  p_event_key TEXT,
  p_payment_method TEXT DEFAULT NULL,
  p_customer_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $$
DECLARE
  v_checkout smarttalk.checkout_sessions%ROWTYPE;
  v_price smarttalk.plan_prices%ROWTYPE;
  v_subscription smarttalk.subscriptions%ROWTYPE;
  v_subscription_id UUID;
  v_payment_amount NUMERIC(10,2);
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_previous_status TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
  INTO v_checkout
  FROM smarttalk.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_session_not_found';
  END IF;

  IF v_checkout.provider <> 'epayco' THEN
    RAISE EXCEPTION 'checkout_provider_mismatch';
  END IF;

  IF v_checkout.status = 'approved' THEN
    SELECT subscription_id
    INTO v_subscription_id
    FROM smarttalk.payments
    WHERE id = p_payment_id
      AND checkout_session_id = v_checkout.id;

    IF v_subscription_id IS NULL THEN
      RAISE EXCEPTION 'approved_checkout_without_subscription';
    END IF;
    RETURN v_subscription_id;
  END IF;

  IF v_checkout.status <> 'pending' OR v_checkout.expires_at < v_now THEN
    RAISE EXCEPTION 'checkout_not_pending';
  END IF;

  SELECT amount
  INTO v_payment_amount
  FROM smarttalk.payments
  WHERE id = p_payment_id
    AND checkout_session_id = v_checkout.id
    AND provider = 'epayco'
    AND status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approved_payment_not_found';
  END IF;

  SELECT *
  INTO v_price
  FROM smarttalk.plan_prices
  WHERE id = v_checkout.plan_price_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_price_not_found';
  END IF;

  SELECT *
  INTO v_subscription
  FROM smarttalk.subscriptions
  WHERE organization_id = v_checkout.organization_id
    AND status IN ('trial', 'active', 'past_due', 'suspended')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_subscription_id := v_subscription.id;
    v_previous_status := v_subscription.status;
    v_period_start := CASE
      WHEN v_subscription.status = 'active'
        AND v_subscription.current_period_end > v_now
      THEN v_subscription.current_period_end
      ELSE v_now
    END;

    v_period_end := CASE v_price.billing_interval
      WHEN 'year' THEN
        v_period_start + make_interval(years => v_price.interval_count)
      ELSE
        v_period_start + make_interval(months => v_price.interval_count)
    END;

    UPDATE smarttalk.subscriptions
    SET plan_id = v_checkout.plan_id,
        plan_price_id = v_checkout.plan_price_id,
        status = 'active',
        provider = 'epayco',
        preferred_gateway = 'epayco',
        renewal_mode = 'manual',
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        cancel_at_period_end = FALSE,
        last_payment_at = v_now,
        last_payment_amount = v_payment_amount,
        payment_method = p_payment_method,
        epayco_customer_id = p_customer_id,
        grace_ends_at = NULL,
        suspended_at = NULL,
        cancelled_at = NULL,
        status_reason = 'payment_approved',
        version = version + 1
    WHERE id = v_subscription_id;
  ELSE
    v_period_start := v_now;
    v_period_end := CASE v_price.billing_interval
      WHEN 'year' THEN
        v_period_start + make_interval(years => v_price.interval_count)
      ELSE
        v_period_start + make_interval(months => v_price.interval_count)
    END;

    INSERT INTO smarttalk.subscriptions(
      organization_id,
      plan_id,
      plan_price_id,
      status,
      provider,
      preferred_gateway,
      renewal_mode,
      current_period_start,
      current_period_end,
      last_payment_at,
      last_payment_amount,
      payment_method,
      epayco_customer_id,
      status_reason,
      version
    )
    VALUES (
      v_checkout.organization_id,
      v_checkout.plan_id,
      v_checkout.plan_price_id,
      'active',
      'epayco',
      'epayco',
      'manual',
      v_period_start,
      v_period_end,
      v_now,
      v_payment_amount,
      p_payment_method,
      p_customer_id,
      'payment_approved',
      2
    )
    RETURNING id INTO v_subscription_id;
  END IF;

  UPDATE smarttalk.organizations
  SET is_active = TRUE,
      plan_id = v_checkout.plan_id,
      preferred_payment_gateway = 'epayco',
      renewal_mode = 'manual'
  WHERE id = v_checkout.organization_id;

  UPDATE smarttalk.payments
  SET subscription_id = v_subscription_id,
      status = 'approved',
      approved_at = COALESCE(approved_at, v_now),
      updated_at = v_now
  WHERE id = p_payment_id;

  UPDATE smarttalk.checkout_sessions
  SET status = 'approved',
      completed_at = v_now,
      updated_at = v_now
  WHERE id = v_checkout.id;

  INSERT INTO smarttalk.subscription_events(
    subscription_id,
    organization_id,
    previous_status,
    new_status,
    reason,
    actor_type,
    correlation_id,
    metadata
  )
  VALUES (
    v_subscription_id,
    v_checkout.organization_id,
    v_previous_status,
    'active',
    'payment_approved',
    'provider',
    p_event_key,
    jsonb_build_object(
      'checkout_session_id', v_checkout.id,
      'payment_id', p_payment_id
    )
  );

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION smarttalk.finalize_epayco_approved_payment(
  UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION smarttalk.finalize_epayco_approved_payment(
  UUID, UUID, TEXT, TEXT, TEXT
) TO service_role;

ALTER TABLE smarttalk.billing_webhook_events
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox', 'production')),
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

ALTER TABLE smarttalk.billing_webhook_events
  ADD CONSTRAINT billing_webhook_events_provider_fk
    FOREIGN KEY (provider)
    REFERENCES smarttalk.payment_gateway_settings(gateway)
    ON DELETE RESTRICT;

ALTER TABLE smarttalk.billing_webhook_events
  DROP CONSTRAINT IF EXISTS billing_webhook_events_status_check;
ALTER TABLE smarttalk.billing_webhook_events
  ADD CONSTRAINT billing_webhook_events_status_check
  CHECK (status IN (
    'received',
    'processing',
    'processed',
    'retry',
    'dead_letter',
    'failed',
    'ignored',
    'invalid'
  ));

ALTER TABLE smarttalk.billing_webhook_events
  DROP CONSTRAINT IF EXISTS billing_webhook_events_provider_event_key_key;
CREATE UNIQUE INDEX idx_billing_webhook_events_dedupe
  ON smarttalk.billing_webhook_events(provider, environment, event_key);
CREATE INDEX idx_billing_webhooks_pending
  ON smarttalk.billing_webhook_events(status, next_attempt_at)
  WHERE status IN ('received', 'retry', 'failed');

CREATE TABLE smarttalk.subscription_entitlement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL
    REFERENCES smarttalk.subscriptions(id) ON DELETE RESTRICT,
  feature_code TEXT NOT NULL
    REFERENCES smarttalk.feature_catalog(code) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL,
  limit_value BIGINT CHECK (limit_value IS NULL OR limit_value >= 0),
  reset_interval TEXT NOT NULL
    CHECK (reset_interval IN ('none', 'billing_period', 'day', 'month')),
  overage_policy TEXT NOT NULL
    CHECK (overage_policy IN ('block', 'allow', 'notify')),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX idx_subscription_entitlement_current
  ON smarttalk.subscription_entitlement_snapshots(subscription_id, feature_code)
  WHERE effective_to IS NULL;

CREATE TABLE smarttalk.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES smarttalk.organizations(id) ON DELETE RESTRICT,
  subscription_id UUID
    REFERENCES smarttalk.subscriptions(id) ON DELETE SET NULL,
  payment_id UUID
    REFERENCES smarttalk.payments(id) ON DELETE SET NULL,
  channel TEXT NOT NULL
    CHECK (channel IN ('email', 'in_app', 'whatsapp')),
  template_code TEXT NOT NULL,
  recipient_agent_id UUID
    REFERENCES smarttalk.agents(id) ON DELETE SET NULL,
  recipient_address_ciphertext BYTEA,
  recipient_hash TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'suppressed')),
  idempotency_key TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  failure_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  UNIQUE(channel, idempotency_key),
  CHECK (
    recipient_agent_id IS NOT NULL
    OR recipient_address_ciphertext IS NOT NULL
  )
);

CREATE INDEX idx_notification_logs_pending
  ON smarttalk.notification_logs(status, next_attempt_at)
  WHERE status IN ('queued', 'failed');
CREATE INDEX idx_notification_logs_org_created
  ON smarttalk.notification_logs(organization_id, created_at DESC);

CREATE TABLE smarttalk.billing_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID
    REFERENCES smarttalk.organizations(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('user', 'admin', 'system', 'provider')),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  correlation_id UUID NOT NULL,
  request_id TEXT,
  before_data JSONB,
  after_data JSONB,
  result TEXT NOT NULL
    CHECK (result IN ('success', 'denied', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_audit_org_created
  ON smarttalk.billing_audit_events(organization_id, created_at DESC);
CREATE INDEX idx_billing_audit_entity
  ON smarttalk.billing_audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_billing_audit_correlation
  ON smarttalk.billing_audit_events(correlation_id);

CREATE TABLE smarttalk.billing_outbox_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL
    CHECK (job_type IN (
      'process_webhook',
      'renew_subscription',
      'reconcile_payment',
      'expire_subscription',
      'apply_plan_change',
      'send_notification'
    )),
  organization_id UUID
    REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  subscription_id UUID
    REFERENCES smarttalk.subscriptions(id) ON DELETE CASCADE,
  payment_id UUID
    REFERENCES smarttalk.payments(id) ON DELETE CASCADE,
  webhook_event_id UUID
    REFERENCES smarttalk.billing_webhook_events(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'dead_letter')),
  payload JSONB NOT NULL DEFAULT '{}',
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_billing_outbox_available
  ON smarttalk.billing_outbox_jobs(status, available_at)
  WHERE status IN ('pending', 'retry');

ALTER TABLE smarttalk.payment_gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.subscription_entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.billing_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.billing_outbox_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_settings_read_authenticated"
  ON smarttalk.payment_gateway_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "subscription_snapshots_read_own_org"
  ON smarttalk.subscription_entitlement_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM smarttalk.subscriptions s
      WHERE s.id = subscription_id
        AND s.organization_id = smarttalk.get_agent_org_id()
    )
  );

CREATE POLICY "notification_logs_read_own_org"
  ON smarttalk.notification_logs FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE TRIGGER payment_gateway_settings_updated_at
  BEFORE UPDATE ON smarttalk.payment_gateway_settings
  FOR EACH ROW EXECUTE FUNCTION smarttalk.update_updated_at();

-- Automatic renewal remains disabled for every existing organization and
-- subscription. Enabling it later requires:
-- 1. provider contract and credentials,
-- 2. an available tokenized payment source,
-- 3. gateway supports_automatic_renewal=true,
-- 4. explicit organization/subscription opt-in,
-- 5. production contract tests and operational approval.
UPDATE smarttalk.organizations SET renewal_mode = 'manual';
UPDATE smarttalk.subscriptions SET renewal_mode = 'manual';
