-- Sprint · Downgrade programado al final del período vigente (D-5 / H-12)
-- ===========================================================================
-- ESTADO: APLICADA en producción el 2026-08-10.
-- Evidencia: Supabase SQL Editor respondió "Success. No rows returned".
--
-- Decisión de negocio implementada
-- --------------------------------
--   D-5 · "El upgrade no acredita períodos anteriores. El downgrade se aplica
--          al final del período vigente y conserva el acceso actual hasta esa
--          fecha."
--
-- Comportamiento ANTES de esta migración
-- --------------------------------------
-- Cualquier cambio de plan se aplicaba de inmediato al aprobarse el pago, así
-- que un downgrade recortaba los límites en el acto: el cliente pagaba por el
-- plan barato y perdía al instante lo que le quedaba del caro.
--
-- Comportamiento DESPUÉS
-- ----------------------
-- Sólo cambia el caso "downgrade sobre una suscripción activa con período
-- vigente". Se detecta comparando `plan_prices.amount_minor` destino contra el
-- del precio actual de la suscripción:
--
--   * `plan_id` NO se toca: el cliente conserva su plan actual.
--   * Se guardan `pending_plan_id`, `pending_plan_price_id` y
--     `change_effective_at = current_period_end` (columnas ya existentes desde
--     la migración 010).
--   * El período se extiende igual que en una renovación: arranca donde
--     terminaba el anterior, de modo que el pago no regala ni quita días.
--   * `organizations.plan_id` tampoco cambia todavía.
--   * El evento se registra con `reason = 'plan_downgrade_scheduled'`.
--
-- El cambio lo materializa `/api/cron/billing-lifecycle` cuando llega
-- `change_effective_at`, dejando `reason = 'plan_change_applied'`.
--
-- TODO LO DEMÁS SE COMPORTA EXACTAMENTE IGUAL que en la migración 033:
-- upgrades, renovaciones, reactivaciones desde suspended/cancelled y la
-- reentrada idempotente con el mismo checkout.
--
-- Qué NO hace
-- -----------
-- No devuelve dinero ni prorratea. D-5 dice explícitamente que el upgrade no
-- acredita períodos anteriores, y aquí se aplica el mismo criterio: el
-- downgrade tampoco genera nota de crédito.
--
-- Riesgo y verificación
-- ---------------------
-- Modifica una función SECURITY DEFINER que mueve dinero. Antes de aplicarla se
-- validó con PostgreSQL 16.14 desechable: la suite completó 18/18 casos, y la
-- aplicación en producción fue confirmada por Supabase SQL Editor.
--
-- Rollback
-- --------
-- Reaplicar `20260810000100_033_subscription_reactivation.sql`, que contiene la
-- versión previa íntegra de la función. Las columnas `pending_*` quedarían con
-- datos que nadie consume; para limpiarlas:
--   UPDATE smarttalk.subscriptions
--      SET pending_plan_id = NULL, pending_plan_price_id = NULL,
--          change_effective_at = NULL
--    WHERE pending_plan_id IS NOT NULL;
-- ===========================================================================

SET search_path TO smarttalk, public, auth, extensions;

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
  v_current_amount_minor BIGINT;
  v_is_downgrade BOOLEAN := FALSE;
  v_reason TEXT := 'payment_approved';
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
    AND status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')
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

    -- ---------------------------------------------------------------------
    -- D-5: ¿es un downgrade sobre una suscripción viva?
    -- ---------------------------------------------------------------------
    SELECT amount_minor
    INTO v_current_amount_minor
    FROM smarttalk.plan_prices
    WHERE id = v_subscription.plan_price_id;

    v_is_downgrade :=
      v_subscription.status = 'active'
      AND v_subscription.current_period_end > v_now
      AND v_subscription.plan_id IS DISTINCT FROM v_checkout.plan_id
      AND v_current_amount_minor IS NOT NULL
      AND v_price.amount_minor < v_current_amount_minor;

    IF v_is_downgrade THEN
      v_reason := 'plan_downgrade_scheduled';

      UPDATE smarttalk.subscriptions
      SET -- plan_id y plan_price_id NO cambian: el acceso actual se conserva.
          status = 'active',
          provider = 'epayco',
          preferred_gateway = 'epayco',
          renewal_mode = 'manual',
          current_period_start = v_period_start,
          current_period_end = v_period_end,
          cancel_at_period_end = FALSE,
          pending_plan_id = v_checkout.plan_id,
          pending_plan_price_id = v_checkout.plan_price_id,
          change_effective_at = v_subscription.current_period_end,
          last_payment_at = v_now,
          last_payment_amount = v_payment_amount,
          payment_method = p_payment_method,
          epayco_customer_id = p_customer_id,
          grace_ends_at = NULL,
          suspended_at = NULL,
          cancelled_at = NULL,
          status_reason = 'plan_downgrade_scheduled',
          version = version + 1
      WHERE id = v_subscription_id;
    ELSE
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
          -- Un upgrade o una renovación cancelan cualquier downgrade que
          -- estuviera programado: el último pago manda.
          pending_plan_id = NULL,
          pending_plan_price_id = NULL,
          change_effective_at = NULL,
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
    END IF;
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

  -- En un downgrade programado la organización conserva su plan actual hasta
  -- que el cron aplique el cambio.
  UPDATE smarttalk.organizations
  SET is_active = TRUE,
      plan_id = CASE WHEN v_is_downgrade THEN plan_id ELSE v_checkout.plan_id END,
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
    v_reason,
    'provider',
    p_event_key,
    jsonb_build_object(
      'checkout_session_id', v_checkout.id,
      'payment_id', p_payment_id,
      'downgrade_scheduled', v_is_downgrade,
      'pending_plan_id', CASE WHEN v_is_downgrade THEN v_checkout.plan_id ELSE NULL END
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

-- Índice para la consulta del cron que materializa los cambios pendientes.
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_plan_change
  ON smarttalk.subscriptions(change_effective_at)
  WHERE pending_plan_id IS NOT NULL;
