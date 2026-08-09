-- Atomic billing quota reservations.
--
-- The application-level check is intentionally retained for UX and audit
-- details. This RPC is the concurrency gate: it serializes reservations for
-- one organization/feature and includes outstanding reservations in usage.

SET search_path TO smarttalk, public, auth, extensions;

CREATE TABLE IF NOT EXISTS smarttalk.billing_quota_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL REFERENCES smarttalk.feature_catalog(code) ON DELETE RESTRICT,
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'consumed', 'released')),
  resource_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_quota_reservations_active
  ON smarttalk.billing_quota_reservations(organization_id, feature_code, status, expires_at)
  WHERE status = 'held';

ALTER TABLE smarttalk.billing_quota_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_quota_reservations_service_only
  ON smarttalk.billing_quota_reservations;
CREATE POLICY billing_quota_reservations_service_only
  ON smarttalk.billing_quota_reservations
  FOR ALL TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE OR REPLACE FUNCTION smarttalk.reserve_billing_capacity(
  p_organization_id UUID,
  p_feature_code TEXT,
  p_quantity BIGINT DEFAULT 1
)
RETURNS TABLE(
  allowed BOOLEAN,
  reservation_id UUID,
  current_usage BIGINT,
  limit_value BIGINT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $function$
DECLARE
  entitlement RECORD;
  base_usage BIGINT := 0;
  held_usage BIGINT := 0;
  requested BIGINT := GREATEST(1, p_quantity);
  new_reservation UUID;
BEGIN
  IF p_organization_id IS NULL OR p_feature_code IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::BIGINT, NULL::BIGINT, 'invalid_input';
    RETURN;
  END IF;

  -- Every caller for the same organization/feature observes a serialized
  -- usage snapshot, including reservations created by other requests.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('billing-quota:' || p_organization_id::TEXT || ':' || p_feature_code, 0)
  );

  UPDATE smarttalk.billing_quota_reservations
  SET status = 'released', released_at = NOW()
  WHERE organization_id = p_organization_id
    AND feature_code = p_feature_code
    AND status = 'held'
    AND expires_at <= NOW();

  SELECT pe.enabled, pe.limit_value, pe.overage_policy
  INTO entitlement
  FROM smarttalk.organizations AS organization
  LEFT JOIN smarttalk.plan_entitlements AS pe
    ON pe.plan_id = organization.plan_id
   AND pe.feature_code = p_feature_code
  WHERE organization.id = p_organization_id;

  IF NOT FOUND OR entitlement.limit_value IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::UUID, NULL::BIGINT, NULL::BIGINT, 'unlimited';
    RETURN;
  END IF;

  IF entitlement.enabled IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::BIGINT, entitlement.limit_value, 'feature_disabled';
    RETURN;
  END IF;

  IF p_feature_code = 'contacts.total' THEN
    SELECT COUNT(*) INTO base_usage
    FROM smarttalk.contacts
    WHERE organization_id = p_organization_id;
  ELSIF p_feature_code = 'channels.active' THEN
    SELECT COUNT(*) INTO base_usage
    FROM smarttalk.channels
    WHERE organization_id = p_organization_id
      AND status <> 'disconnected';
  ELSIF p_feature_code = 'automations.flows' THEN
    SELECT COUNT(*) INTO base_usage
    FROM smarttalk.chatbot_flows
    WHERE organization_id = p_organization_id;
  ELSIF p_feature_code = 'brands.total' THEN
    SELECT COUNT(*) INTO base_usage
    FROM public.cm_clients
    WHERE smarttalk_organization_id = p_organization_id;
  ELSE
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::BIGINT, entitlement.limit_value, 'unsupported_feature';
    RETURN;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
  INTO held_usage
  FROM smarttalk.billing_quota_reservations
  WHERE organization_id = p_organization_id
    AND feature_code = p_feature_code
    AND status = 'held'
    AND expires_at > NOW();

  IF entitlement.overage_policy = 'block'
     AND base_usage + held_usage + requested > entitlement.limit_value THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      base_usage + held_usage,
      entitlement.limit_value,
      'limit_reached';
    RETURN;
  END IF;

  INSERT INTO smarttalk.billing_quota_reservations(
    organization_id, feature_code, quantity
  )
  VALUES (p_organization_id, p_feature_code, requested)
  RETURNING id INTO new_reservation;

  RETURN QUERY SELECT
    TRUE,
    new_reservation,
    base_usage + held_usage,
    entitlement.limit_value,
    'reserved';
END;
$function$;

CREATE OR REPLACE FUNCTION smarttalk.consume_billing_capacity(
  p_reservation_id UUID,
  p_resource_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $function$
BEGIN
  UPDATE smarttalk.billing_quota_reservations
  SET status = 'consumed',
      resource_id = p_resource_id,
      consumed_at = NOW()
  WHERE id = p_reservation_id
    AND status = 'held'
    AND expires_at > NOW();
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION smarttalk.release_billing_capacity(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $function$
BEGIN
  UPDATE smarttalk.billing_quota_reservations
  SET status = 'released', released_at = NOW()
  WHERE id = p_reservation_id
    AND status = 'held';
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION smarttalk.reserve_billing_capacity(UUID, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION smarttalk.consume_billing_capacity(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION smarttalk.release_billing_capacity(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION smarttalk.reserve_billing_capacity(UUID, TEXT, BIGINT)
  TO service_role;
GRANT EXECUTE ON FUNCTION smarttalk.consume_billing_capacity(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION smarttalk.release_billing_capacity(UUID)
  TO service_role;
