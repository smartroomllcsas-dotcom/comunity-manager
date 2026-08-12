-- Sprint · Desactivación reversible de marcas (pausa de marca)
-- ===========================================================================
-- ESTADO: NO APLICADA. Preparada para revisión de Codex.
--
-- Objetivo de negocio
-- -------------------
-- La agencia necesita dejar de administrar una marca sin eliminarla. Una marca
-- pausada deja de recibir leads, mensajes y eventos, libera su cupo de marca
-- activa —para poder crear otra dentro del mismo plan— y conserva intacto todo
-- su histórico. La operación es reversible.
--
-- Qué NO hace esta migración
-- --------------------------
--   * No borra ninguna fila de cm_clients, contacts, conversations, messages,
--     cm_social_accounts, cm_whatsapp_accounts ni brand_advisor_assignments.
--   * No toca tokens ni credenciales cifradas.
--   * No cancela suscripciones.
--   * No cambia el tipo enum smarttalk.channel_status: 'disconnected' y
--     'pending' ya existen y son suficientes.
--
-- Estado usado
-- ------------
-- `public.cm_clients.status` es TEXT (no un enum), y hoy contiene 'onboarding'
-- y 'active'. Se reutiliza el valor **'paused'**, que la interfaz de /clients
-- ya sabe pintar (`statusStyles.paused`). Al cliente se le muestra la etiqueta
-- "Inactiva". No se crea ningún estado nuevo.
--
-- ===========================================================================
-- 1. Admitir 'paused' en cm_clients.status
-- ===========================================================================
-- La columna es TEXT y en producción no se observó ningún CHECK, pero la
-- migración no puede asumirlo: si existe uno que enumere estados, hay que
-- extenderlo en vez de dejar que el UPDATE falle en caliente.
--
-- Se **extiende**, no se elimina: la definición previa se conserva íntegra y
-- sólo se le añade la alternativa `status = 'paused'`. Así no se pierde la
-- validación que hubiera antes.
DO $$
DECLARE
  con RECORD;
  body TEXT;
  no_validado BOOLEAN;
BEGIN
  IF to_regclass('public.cm_clients') IS NULL THEN
    RAISE NOTICE 'public.cm_clients no existe en esta base; se omite el ajuste del CHECK.';
    RETURN;
  END IF;

  FOR con IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.cm_clients'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    IF con.def ILIKE '%paused%' THEN
      RAISE NOTICE 'CHECK % ya admite paused; sin cambios.', con.conname;
      CONTINUE;
    END IF;

    -- pg_get_constraintdef devuelve 'CHECK ((<cuerpo>))', y añade el sufijo
    -- ' NOT VALID' cuando la restricción nunca se validó contra las filas
    -- existentes. Ese sufijo hay que separarlo antes de reutilizar el cuerpo:
    -- incrustado dentro del paréntesis daría un error de sintaxis.
    body := regexp_replace(con.def, '^CHECK\s*', '');
    no_validado := body ~ 'NOT VALID\s*$';
    body := regexp_replace(body, '\s*NOT VALID\s*$', '');

    EXECUTE format('ALTER TABLE public.cm_clients DROP CONSTRAINT %I', con.conname);
    EXECUTE format(
      'ALTER TABLE public.cm_clients ADD CONSTRAINT %I CHECK (%s OR status = ''paused'')%s',
      con.conname,
      body,
      -- Se conserva el estado de validación original: revalidar de golpe una
      -- restricción que el equipo dejó NOT VALID a propósito podría fallar por
      -- filas históricas que nada tienen que ver con esta migración.
      CASE WHEN no_validado THEN ' NOT VALID' ELSE '' END
    );
    RAISE NOTICE 'CHECK % extendido para admitir paused. Definición previa: %', con.conname, con.def;
  END LOOP;
END $$;

-- ===========================================================================
-- 2. Estado previo de cada canal, para poder restaurarlo
-- ===========================================================================
-- Una fila por canal. La restricción única por channel_id evita duplicados y
-- convierte la pausa en idempotente: pausar dos veces hace UPSERT sobre la
-- misma fila en vez de acumular estados.
--
-- Consecuencia aceptada y documentada: la tabla guarda **la última** pausa de
-- cada canal, no el historial completo. El historial de la operación vive en
-- brand_lifecycle_events (punto 3), que sí es append-only.
CREATE TABLE IF NOT EXISTS smarttalk.brand_channel_pause_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL
    REFERENCES smarttalk.channels(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL,
  organization_id UUID NOT NULL
    REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  -- Estado operativo que tenía el canal justo antes de la pausa. Es lo único
  -- que permite no reactivar un canal que ya estaba caído.
  previous_status smarttalk.channel_status NOT NULL,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_by UUID REFERENCES smarttalk.agents(id) ON DELETE SET NULL,
  -- NULL mientras la pausa sigue vigente. Se sella al reactivar.
  reactivated_at TIMESTAMPTZ,
  reactivated_by UUID REFERENCES smarttalk.agents(id) ON DELETE SET NULL,
  -- Resultado de la reactivación cuando no se pudo restaurar el canal:
  -- 'token_expired' | 'revoked'. NULL si se restauró sin novedad.
  reactivation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_brand_channel_pause_state_channel
  ON smarttalk.brand_channel_pause_state(channel_id);

-- Consulta caliente de la reactivación: "canales pausados y aún no reactivados
-- de esta marca".
CREATE INDEX IF NOT EXISTS idx_brand_channel_pause_state_pending
  ON smarttalk.brand_channel_pause_state(brand_id)
  WHERE reactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_brand_channel_pause_state_org
  ON smarttalk.brand_channel_pause_state(organization_id);

ALTER TABLE smarttalk.brand_channel_pause_state ENABLE ROW LEVEL SECURITY;

-- Igual que billing_quota_reservations: sólo service_role. Ningún cliente
-- necesita leerla directamente; la interfaz recibe lo que decide el endpoint.
DROP POLICY IF EXISTS brand_channel_pause_state_service_only
  ON smarttalk.brand_channel_pause_state;
CREATE POLICY brand_channel_pause_state_service_only
  ON smarttalk.brand_channel_pause_state
  FOR ALL TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- ===========================================================================
-- 3. Quién pausó y cuándo (append-only)
-- ===========================================================================
-- Requisito "registrar quién y cuándo realizó la pausa". No puede vivir sólo
-- en brand_channel_pause_state por dos razones: esa tabla es una fila por
-- canal —una marca sin canales no dejaría rastro alguno— y su restricción
-- única sobrescribe la pausa anterior.
CREATE TABLE IF NOT EXISTS smarttalk.brand_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  organization_id UUID NOT NULL
    REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('deactivate', 'reactivate')),
  -- TRUE cuando la llamada no cambió nada porque la marca ya estaba en el
  -- estado pedido. Deja constancia del intento sin fingir una transición.
  was_noop BOOLEAN NOT NULL DEFAULT FALSE,
  previous_brand_status TEXT,
  new_brand_status TEXT,
  channels_affected INT NOT NULL DEFAULT 0,
  actor_agent_id UUID REFERENCES smarttalk.agents(id) ON DELETE SET NULL,
  actor_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_lifecycle_events_brand
  ON smarttalk.brand_lifecycle_events(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brand_lifecycle_events_org
  ON smarttalk.brand_lifecycle_events(organization_id, created_at DESC);

ALTER TABLE smarttalk.brand_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_lifecycle_events_service_only
  ON smarttalk.brand_lifecycle_events;
CREATE POLICY brand_lifecycle_events_service_only
  ON smarttalk.brand_lifecycle_events
  FOR ALL TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- ===========================================================================
-- 4. brands.total deja de contar marcas pausadas
-- ===========================================================================
-- Es el punto que hace útil toda la funcionalidad: si la marca pausada siguiera
-- ocupando cupo, desactivarla no permitiría crear otra.
--
-- Se re-emite la función completa (CREATE OR REPLACE). **La única diferencia**
-- respecto a la migración 031 es el filtro de la rama 'brands.total'. El resto
-- del cuerpo —bloqueo advisory, expiración de reservas, entitlements, el resto
-- de features y las respuestas— es idéntico.
--
-- `channels.active` no necesita cambio: ya excluye 'disconnected', y la pausa
-- deja los canales exactamente en ese estado.
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
    -- ÚNICO CAMBIO respecto a la migración 031: las marcas pausadas no ocupan
    -- cupo. Se cuenta por exclusión (`IS DISTINCT FROM 'paused'`) y no por
    -- lista blanca, para que un estado futuro siga contando por defecto y para
    -- que un status NULL no desaparezca de la cuenta.
    SELECT COUNT(*) INTO base_usage
    FROM public.cm_clients
    WHERE smarttalk_organization_id = p_organization_id
      AND status IS DISTINCT FROM 'paused';
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

-- ===========================================================================
-- 5. Notas de operación
-- ===========================================================================
-- * Idempotencia: pausar una marca ya pausada no inserta filas nuevas en
--   brand_channel_pause_state (UPSERT por channel_id) y registra el intento en
--   brand_lifecycle_events con was_noop = TRUE.
-- * La reactivación restaura únicamente los canales cuya `previous_status` era
--   'active'. Un canal que ya estaba 'disconnected' o 'error' antes de la pausa
--   se queda como estaba: la pausa no puede arreglar lo que ya estaba roto.
-- * El rollback está documentado en supabase/migrations/ROLLBACK.md.
