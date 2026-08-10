-- ===========================================================================
-- Fixtures de ciclo de vida para la suite de integración PostgreSQL/RLS.
--
-- ÁMBITO: base QA DESECHABLE únicamente. Este archivo crea funciones bajo el
-- prefijo `qa_` que SIEMBRAN DATOS. No debe aplicarse nunca a Production.
-- `scripts/qa-postgres-suite.mjs` rechaza cadenas de conexión que parezcan
-- gestionadas o productivas antes de cargarlo.
--
-- Las funciones NO abren transacción propia: se invocan desde el test dentro de
-- BEGIN … ROLLBACK, de modo que ningún dato sobrevive a la ejecución.
--
-- Todos los registros llevan el prefijo '[QA-FIXTURE]' en su nombre y correos
-- en el dominio reservado `.invalid`, para que un fallo de rollback sea
-- evidente e inofensivo.
-- ===========================================================================

SET search_path TO smarttalk, public, auth, extensions;

-- ---------------------------------------------------------------------------
-- Usuario de prueba: `checkout_sessions.initiated_by` referencia auth.users.
-- Se reutiliza cualquier usuario existente antes de intentar crear uno, porque
-- auth.users es una tabla gestionada por Supabase y su forma cambia entre
-- versiones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION smarttalk.qa_fixture_user()
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;

  BEGIN
    INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'qa-fixture@example.invalid')
    RETURNING id INTO v_user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION
      'qa_fixture_user: no hay usuarios en auth.users y no se pudo crear uno (%). Crea un usuario de prueba en la base QA antes de correr la suite.',
      SQLERRM;
  END;

  RETURN v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Siembra un caso completo de ciclo de vida.
--
-- p_case admite:
--   'active'        suscripción vigente con período futuro
--   'past_due'      vencida, todavía dentro de la ventana de gracia
--   'grace_period'  alias explícito de past_due dentro de gracia
--   'past_due_expired'  vencida con la gracia ya terminada
--   'suspended'     suspendida tras agotar la gracia
--   'cancelled'     cancelada
--   'renewal'       activa y próxima a vencer (para probar extensión de período)
--   'plan_change'   activa en el plan A con un checkout pendiente del plan B
--   'no_subscription'   organización sin suscripción
--
-- Devuelve un jsonb con todos los identificadores necesarios para invocar
-- smarttalk.finalize_epayco_approved_payment y aseverar el resultado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION smarttalk.qa_seed_lifecycle_case(
  p_case TEXT,
  p_label TEXT DEFAULT 'qa-fixture'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := smarttalk.qa_fixture_user();
  v_org_id UUID;
  v_plan_a UUID;
  v_plan_b UUID;
  v_price_a UUID;
  v_price_b UUID;
  v_target_plan UUID;
  v_target_price UUID;
  v_subscription_id UUID;
  v_checkout_id UUID;
  v_payment_id UUID;
  v_reference TEXT := format('[QA-FIXTURE]-%s-%s', p_label, gen_random_uuid());
  v_now TIMESTAMPTZ := NOW();
  v_status TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_grace_ends TIMESTAMPTZ;
  v_suspended_at TIMESTAMPTZ;
  v_cancelled_at TIMESTAMPTZ;
BEGIN
  IF p_case NOT IN (
    'active', 'past_due', 'grace_period', 'past_due_expired',
    'suspended', 'cancelled', 'renewal', 'plan_change', 'no_subscription'
  ) THEN
    RAISE EXCEPTION 'qa_seed_lifecycle_case: caso desconocido %', p_case;
  END IF;

  -- La pasarela ePayco debe existir por la FK de payments/subscriptions.
  INSERT INTO smarttalk.payment_gateway_settings(gateway, display_name, is_enabled, checkout_enabled)
  VALUES ('epayco', 'ePayco', TRUE, TRUE)
  ON CONFLICT (gateway) DO NOTHING;

  INSERT INTO smarttalk.plans(name, max_agents, max_contacts, max_broadcasts_per_month, max_chatbot_flows, price_monthly)
  VALUES ('[QA-FIXTURE] Plan A', 2, 1000, 10, 2, 59000)
  RETURNING id INTO v_plan_a;

  INSERT INTO smarttalk.plans(name, max_agents, max_contacts, max_broadcasts_per_month, max_chatbot_flows, price_monthly)
  VALUES ('[QA-FIXTURE] Plan B', 5, 5000, 50, 10, 149000)
  RETURNING id INTO v_plan_b;

  INSERT INTO smarttalk.plan_prices(plan_id, currency, amount_minor, billing_interval, interval_count, provider, is_active)
  VALUES (v_plan_a, 'COP', 5900000, 'month', 1, 'epayco', TRUE)
  RETURNING id INTO v_price_a;

  INSERT INTO smarttalk.plan_prices(plan_id, currency, amount_minor, billing_interval, interval_count, provider, is_active)
  VALUES (v_plan_b, 'COP', 14900000, 'month', 1, 'epayco', TRUE)
  RETURNING id INTO v_price_b;

  INSERT INTO smarttalk.organizations(name, plan_id, is_active)
  VALUES (format('[QA-FIXTURE] Org %s', p_case), v_plan_a, TRUE)
  RETURNING id INTO v_org_id;

  -- Estado de la suscripción según el caso.
  v_status := CASE p_case
    WHEN 'grace_period' THEN 'past_due'
    WHEN 'past_due_expired' THEN 'past_due'
    WHEN 'renewal' THEN 'active'
    WHEN 'plan_change' THEN 'active'
    ELSE p_case
  END;

  v_period_start := CASE p_case
    WHEN 'renewal' THEN v_now - INTERVAL '29 days'
    ELSE v_now - INTERVAL '30 days'
  END;

  v_period_end := CASE p_case
    WHEN 'active' THEN v_now + INTERVAL '15 days'
    WHEN 'plan_change' THEN v_now + INTERVAL '15 days'
    WHEN 'renewal' THEN v_now + INTERVAL '1 day'
    ELSE v_now - INTERVAL '1 day'
  END;

  v_grace_ends := CASE p_case
    WHEN 'past_due' THEN v_now + INTERVAL '2 days'
    WHEN 'grace_period' THEN v_now + INTERVAL '2 days'
    WHEN 'past_due_expired' THEN v_now - INTERVAL '1 hour'
    ELSE NULL
  END;

  v_suspended_at := CASE WHEN p_case = 'suspended' THEN v_now - INTERVAL '1 hour' ELSE NULL END;
  v_cancelled_at := CASE WHEN p_case = 'cancelled' THEN v_now - INTERVAL '1 hour' ELSE NULL END;

  IF p_case <> 'no_subscription' THEN
    INSERT INTO smarttalk.subscriptions(
      organization_id, plan_id, plan_price_id, status, provider, preferred_gateway,
      renewal_mode, current_period_start, current_period_end, cancel_at_period_end,
      grace_ends_at, suspended_at, cancelled_at, status_reason
    )
    VALUES (
      v_org_id, v_plan_a, v_price_a, v_status, 'epayco', 'epayco',
      'manual', v_period_start, v_period_end, FALSE,
      v_grace_ends, v_suspended_at, v_cancelled_at, format('qa_fixture_%s', p_case)
    )
    RETURNING id INTO v_subscription_id;
  END IF;

  -- El checkout apunta al plan B sólo en el caso de cambio de plan.
  v_target_plan := CASE WHEN p_case = 'plan_change' THEN v_plan_b ELSE v_plan_a END;
  v_target_price := CASE WHEN p_case = 'plan_change' THEN v_price_b ELSE v_price_a END;

  INSERT INTO smarttalk.checkout_sessions(
    internal_reference, organization_id, plan_id, plan_price_id, initiated_by,
    provider, status, amount_minor, currency, test_mode, environment, purpose, expires_at
  )
  VALUES (
    v_reference, v_org_id, v_target_plan, v_target_price, v_user_id,
    'epayco', 'pending',
    (SELECT amount_minor FROM smarttalk.plan_prices WHERE id = v_target_price),
    'COP', TRUE, 'sandbox',
    CASE
      WHEN p_case IN ('suspended', 'cancelled') THEN 'reactivation'
      WHEN p_case = 'plan_change' THEN 'upgrade'
      WHEN p_case = 'renewal' THEN 'renewal'
      ELSE 'initial'
    END,
    v_now + INTERVAL '30 minutes'
  )
  RETURNING id INTO v_checkout_id;

  INSERT INTO smarttalk.payments(
    organization_id, checkout_session_id, provider, provider_transaction_id,
    amount, amount_minor, currency, status, environment, merchant_reference,
    test_mode, purpose, approved_at
  )
  VALUES (
    v_org_id, v_checkout_id, 'epayco', format('QA-TXN-%s', gen_random_uuid()),
    (SELECT amount_minor FROM smarttalk.plan_prices WHERE id = v_target_price) / 100.0,
    (SELECT amount_minor FROM smarttalk.plan_prices WHERE id = v_target_price),
    'COP', 'approved', 'sandbox', v_reference,
    TRUE,
    CASE
      WHEN p_case IN ('suspended', 'cancelled') THEN 'reactivation'
      WHEN p_case = 'plan_change' THEN 'upgrade'
      WHEN p_case = 'renewal' THEN 'renewal'
      ELSE 'initial'
    END,
    v_now
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'case', p_case,
    'organization_id', v_org_id,
    'subscription_id', v_subscription_id,
    'checkout_session_id', v_checkout_id,
    'payment_id', v_payment_id,
    'plan_a_id', v_plan_a,
    'plan_b_id', v_plan_b,
    'price_a_id', v_price_a,
    'price_b_id', v_price_b,
    'target_plan_id', v_target_plan,
    'user_id', v_user_id,
    'seeded_status', v_status,
    'current_period_end', v_period_end,
    'grace_ends_at', v_grace_ends
  );
END;
$$;

-- Alias retrocompatible usado por tests/postgres-integration.test.mjs.
CREATE OR REPLACE FUNCTION smarttalk.qa_seed_reactivation_case(p_case TEXT)
RETURNS JSONB
LANGUAGE sql
AS $$
  SELECT smarttalk.qa_seed_lifecycle_case(p_case, 'reactivation');
$$;

-- ---------------------------------------------------------------------------
-- Limpieza defensiva: elimina cualquier residuo con el prefijo del fixture.
-- Sólo debería encontrar filas si un ROLLBACK falló.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION smarttalk.qa_cleanup_fixtures()
RETURNS TABLE(deleted_table TEXT, deleted_rows BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  DELETE FROM smarttalk.checkout_sessions WHERE internal_reference LIKE '[QA-FIXTURE]%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  deleted_table := 'checkout_sessions'; deleted_rows := v_count; RETURN NEXT;

  DELETE FROM smarttalk.organizations WHERE name LIKE '[QA-FIXTURE]%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  deleted_table := 'organizations'; deleted_rows := v_count; RETURN NEXT;

  DELETE FROM smarttalk.plans WHERE name LIKE '[QA-FIXTURE]%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  deleted_table := 'plans'; deleted_rows := v_count; RETURN NEXT;
END;
$$;

-- Las funciones de fixture jamás deben ser alcanzables desde la app.
REVOKE ALL ON FUNCTION smarttalk.qa_fixture_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION smarttalk.qa_seed_lifecycle_case(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION smarttalk.qa_seed_reactivation_case(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION smarttalk.qa_cleanup_fixtures() FROM PUBLIC, anon, authenticated;
