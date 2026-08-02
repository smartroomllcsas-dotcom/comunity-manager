-- Sprint 26 · Agente S · Onboarding wizard
-- ---------------------------------------------------------------------------
-- Cierra el gap de "hoy la agencia debe crear clientes a mano". Persiste el
-- progreso de un wizard multi-step + opcionalmente un magic-link para que el
-- cliente termine el self-onboarding sin cuenta.
--
-- Tabla:
--   public.cm_onboarding_state  - progreso paso a paso por cliente. Isolado
--                                  por organization_id (RLS via
--                                  smarttalk.get_agent_org_id()).
--
-- Steps:
--   welcome         - nombre cliente + brand + idioma
--   brand           - logo + colores + brand voice
--   platforms       - conectar cuentas sociales (OAuth por platform)
--   content_pillars - 3-5 pilares con descripcion
--   preferences     - timezone + frequency + approval mode
--   review          - resumen final
--   done            - completado
--
-- Magic-link self-onboarding:
--   invite_token_hash  - SHA-256 del token HMAC (nunca guardar el crudo)
--   invite_expires_at  - TTL default 30 dias
--
-- SECURITY: token real solo circula en URL enviada al cliente. Nosotros
-- guardamos hash y lo cruzamos igual que approval workflow (Sprint 25).

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.cm_onboarding_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  step TEXT NOT NULL CHECK (step IN ('welcome','brand','platforms','content_pillars','preferences','review','done')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
  invite_token_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_onboarding_state_org
  ON public.cm_onboarding_state (organization_id);

CREATE INDEX IF NOT EXISTS idx_cm_onboarding_state_pending
  ON public.cm_onboarding_state (invite_expires_at)
  WHERE completed_at IS NULL;

ALTER TABLE public.cm_onboarding_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE tablename = 'cm_onboarding_state'
      AND policyname = 'cm_onboarding_state_org_isolation'
  ) THEN
    CREATE POLICY "cm_onboarding_state_org_isolation" ON public.cm_onboarding_state
      FOR ALL USING (organization_id = (SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1));
  END IF;
END $$;
