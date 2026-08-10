-- Sprint · Reactivación de suscripciones canceladas
-- ===========================================================================
-- ESTADO: NO APLICADA. Requiere revisión y aprobación de Codex antes de
-- ejecutarse en cualquier base. No fue ejecutada contra QA ni Production.
--
-- Problema que corrige
-- --------------------
-- `finalize_epayco_approved_payment` selecciona la suscripción a reactivar con
--     WHERE organization_id = ... AND status IN ('trial','active','past_due','suspended')
-- La lista omite 'cancelled'. Un cliente que canceló y vuelve a pagar no
-- coincide con ese SELECT, así que el RPC entra por la rama ELSE e INSERTA una
-- suscripción nueva: la organización queda con dos filas (una 'cancelled' y una
-- 'active') y cualquier consulta que ordene por created_at ve dos historiales.
--
-- Cambio
-- ------
-- Incluir 'cancelled' en el SELECT ... FOR UPDATE para que la fila existente se
-- reutilice. El resto del cuerpo ya es correcto para reactivar:
--   * v_period_start = NOW() salvo que la suscripción esté 'active' con período
--     futuro, así que una reactivación nunca hereda un período vencido.
--   * limpia grace_ends_at, suspended_at y cancelled_at.
--   * registra subscription_events con previous_status real.
--
-- Lo que este cambio NO decide
-- ----------------------------
-- Si el negocio prefiere conservar la fila cancelada como histórico y crear una
-- suscripción nueva, esta migración es la opción equivocada y debe descartarse.
-- La decisión no está documentada en el repositorio; se implementa la
-- reutilización porque es la que evita el estado ambiguo de dos suscripciones
-- simultáneas para una misma organización.
--
-- Rollback
-- --------
-- Volver a aplicar la definición de la migración
-- 20260729000200_010_multi_gateway_manual_renewal.sql (líneas 180-390), que
-- contiene la versión previa íntegra de la función.
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

  -- ÚNICO CAMBIO FUNCIONAL respecto de la migración 010: se añade 'cancelled'.
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
