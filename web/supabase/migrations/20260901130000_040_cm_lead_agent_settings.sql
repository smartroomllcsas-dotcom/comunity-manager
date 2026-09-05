-- =============================================================================
-- 040 — cm_lead_agent_settings: automatización de leads por empresa/marca.
--
-- Por cada cm_client (empresa) el administrador define:
--   · qué plantilla WA se envía automáticamente al lead nuevo de formulario
--   · qué plantilla se usa para retomar la conversación
--   · el contexto/instrucciones del agente IA para ESA empresa (qué información
--     del proyecto debe recolectar, tono, objetivo)
--   · el enlace de agenda (Cal.com) al que el agente debe llevar al lead
--
-- Idempotente. RLS permissive: mismo patrón cm_* (enforcement app-level via
-- getCmClientAccess, ver comentario largo en cm-client-access.ts).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cm_lead_agent_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID NOT NULL UNIQUE REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  enabled                  BOOLEAN NOT NULL DEFAULT false,
  first_touch_template_id  UUID REFERENCES public.cm_wa_templates(id) ON DELETE SET NULL,
  reengage_template_id     UUID REFERENCES public.cm_wa_templates(id) ON DELETE SET NULL,
  reengage_after_hours     INT NOT NULL DEFAULT 24 CHECK (reengage_after_hours BETWEEN 1 AND 168),
  agent_context            TEXT,
  booking_url              TEXT,
  max_sends_per_hour       INT NOT NULL DEFAULT 20 CHECK (max_sends_per_hour BETWEEN 1 AND 500),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cm_lead_agent_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cm_lead_agent_settings'
      AND policyname = 'cm_lead_agent_settings_all'
  ) THEN
    CREATE POLICY cm_lead_agent_settings_all ON public.cm_lead_agent_settings
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- updated_at trigger (reusa la función si ya existe con el patrón cm_*)
CREATE OR REPLACE FUNCTION public.cm_lead_agent_settings_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cm_lead_agent_settings_touch_trg ON public.cm_lead_agent_settings;
CREATE TRIGGER cm_lead_agent_settings_touch_trg
  BEFORE UPDATE ON public.cm_lead_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.cm_lead_agent_settings_touch();
