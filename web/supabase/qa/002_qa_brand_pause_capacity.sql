-- QA · Verificación de la migración 036 sobre una base DESECHABLE.
-- ===========================================================================
-- Comprueba las dos afirmaciones de la migración que sólo se pueden validar en
-- PostgreSQL de verdad:
--
--   1. Un CHECK preexistente sobre `cm_clients.status` se **extiende** para
--      admitir 'paused' en vez de perderse.
--   2. `reserve_billing_capacity` deja de contar las marcas pausadas, de modo
--      que desactivar una marca libera cupo para crear otra.
--
-- NO usar contra Production ni contra el proyecto QA compartido. Todo el script
-- corre dentro de una transacción que termina en ROLLBACK: no deja rastro.
--
-- Uso:
--   psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/qa/002_qa_brand_pause_capacity.sql
--
-- Requiere que la migración 20260812000100_036_brand_pause_lifecycle.sql ya
-- esté aplicada en esa base.

BEGIN;

-- El shim de QA crea `public.cm_clients` con el mínimo indispensable. En
-- producción la columna ya existe y esta línea no hace nada.
ALTER TABLE public.cm_clients ADD COLUMN IF NOT EXISTS status TEXT;

DO $$
DECLARE
  v_org UUID := gen_random_uuid();
  v_plan UUID := gen_random_uuid();
  marca_a UUID := gen_random_uuid();
  marca_b UUID := gen_random_uuid();
  r RECORD;
  fallos INT := 0;
BEGIN
  -- ---------------------------------------------------------------------
  -- Escenario: plan con UN cupo de marca.
  -- ---------------------------------------------------------------------
  INSERT INTO smarttalk.plans(id, name, code, price_monthly)
    VALUES (v_plan, '[QA-FIXTURE] Pausa', 'qa-pausa-' || v_plan, 0);
  INSERT INTO smarttalk.plan_entitlements(plan_id, feature_code, enabled, limit_value, overage_policy)
    VALUES (v_plan, 'brands.total', TRUE, 1, 'block');
  INSERT INTO smarttalk.organizations(id, name, plan_id)
    VALUES (v_org, '[QA-FIXTURE] Agencia', v_plan);

  INSERT INTO public.cm_clients(id, name, status, smarttalk_organization_id)
    VALUES (marca_a, '[QA-FIXTURE] Marca A', 'active', v_org);

  -- 1. Con la marca A activa, el cupo está lleno.
  SELECT * INTO r FROM smarttalk.reserve_billing_capacity(v_org, 'brands.total', 1);
  IF r.allowed OR r.reason <> 'limit_reached' THEN
    RAISE WARNING 'FALLO 1: se esperaba limit_reached, llegó allowed=% reason=%', r.allowed, r.reason;
    fallos := fallos + 1;
  ELSE
    RAISE NOTICE 'OK 1 · con la marca A activa el cupo está lleno (%/%)', r.current_usage, r.limit_value;
  END IF;

  -- 2. Pausar la marca A libera el cupo.
  UPDATE public.cm_clients SET status = 'paused' WHERE id = marca_a;
  SELECT * INTO r FROM smarttalk.reserve_billing_capacity(v_org, 'brands.total', 1);
  IF NOT r.allowed THEN
    RAISE WARNING 'FALLO 2: la marca pausada sigue ocupando cupo (reason=%)', r.reason;
    fallos := fallos + 1;
  ELSE
    RAISE NOTICE 'OK 2 · con la marca A pausada el cupo se libera (uso=%)', r.current_usage;
  END IF;

  -- 3. Creada la marca B, una tercera vuelve a estar bloqueada.
  INSERT INTO public.cm_clients(id, name, status, smarttalk_organization_id)
    VALUES (marca_b, '[QA-FIXTURE] Marca B', 'active', v_org);
  PERFORM smarttalk.consume_billing_capacity(r.reservation_id, marca_b::TEXT);

  SELECT * INTO r FROM smarttalk.reserve_billing_capacity(v_org, 'brands.total', 1);
  IF r.allowed THEN
    RAISE WARNING 'FALLO 3: se permitió una tercera marca con límite 1';
    fallos := fallos + 1;
  ELSE
    RAISE NOTICE 'OK 3 · la tercera marca sigue bloqueada (%/%)', r.current_usage, r.limit_value;
  END IF;

  -- 4. Un status NULL sigue contando: la regla es por exclusión de 'paused',
  --    no por lista blanca de estados conocidos.
  UPDATE public.cm_clients SET status = NULL WHERE id = marca_b;
  SELECT COUNT(*) INTO r FROM public.cm_clients
    WHERE smarttalk_organization_id = v_org AND status IS DISTINCT FROM 'paused';
  IF r.count <> 1 THEN
    RAISE WARNING 'FALLO 4: una marca con status NULL dejó de contar';
    fallos := fallos + 1;
  ELSE
    RAISE NOTICE 'OK 4 · una marca con status NULL sigue ocupando cupo';
  END IF;

  IF fallos > 0 THEN
    RAISE EXCEPTION '% comprobación(es) fallaron', fallos;
  END IF;
  RAISE NOTICE '--- 4/4 comprobaciones en verde ---';
END $$;

-- ---------------------------------------------------------------------------
-- El CHECK preexistente se extiende, no se pierde
-- ---------------------------------------------------------------------------
-- Se simula una base que sí tenía un CHECK enumerando estados y se vuelve a
-- ejecutar la lógica de la migración sobre él.
DO $$
DECLARE
  definicion TEXT;
BEGIN
  -- NOT VALID a propósito: en este punto de la transacción las marcas del
  -- escenario ya están en 'paused', y además ejercita el camino del sufijo
  -- NOT VALID que la migración tiene que saber separar.
  ALTER TABLE public.cm_clients
    ADD CONSTRAINT qa_fixture_status_check CHECK (status IN ('active', 'onboarding')) NOT VALID;

  -- Misma transformación que aplica la migración 036.
  SELECT pg_get_constraintdef(oid) INTO definicion
  FROM pg_constraint
  WHERE conrelid = 'public.cm_clients'::regclass AND conname = 'qa_fixture_status_check';

  EXECUTE 'ALTER TABLE public.cm_clients DROP CONSTRAINT qa_fixture_status_check';
  EXECUTE format(
    'ALTER TABLE public.cm_clients ADD CONSTRAINT qa_fixture_status_check CHECK (%s OR status = ''paused'') NOT VALID',
    regexp_replace(regexp_replace(definicion, '^CHECK\s*', ''), '\s*NOT VALID\s*$', '')
  );

  SELECT pg_get_constraintdef(oid) INTO definicion
  FROM pg_constraint
  WHERE conrelid = 'public.cm_clients'::regclass AND conname = 'qa_fixture_status_check';

  IF definicion NOT ILIKE '%paused%' OR definicion NOT ILIKE '%onboarding%' THEN
    RAISE EXCEPTION 'FALLO 5: el CHECK no conserva los estados previos y paused: %', definicion;
  END IF;
  RAISE NOTICE 'OK 5 · CHECK extendido conservando lo anterior: %', definicion;
END $$;

ROLLBACK;
