-- 039_cm_wa_templates.sql
-- WhatsApp Business Platform (Cloud API oficial) — Message Templates multi-tenant.
-- Cada template pertenece a un cm_whatsapp_accounts (una WABA por cm_clients).
-- Enforcement app-level via getCmClientAccess(); RLS permissive alineado con
-- el resto de tablas cm_* (ver comentario largo en cm-client-access.ts).
-- Idempotente. Ninguna tabla existente se modifica.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Enums
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cm_wa_template_status') THEN
    CREATE TYPE cm_wa_template_status AS ENUM (
      'APPROVED','PENDING','REJECTED','PAUSED','DISABLED','IN_APPEAL','PENDING_DELETION'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cm_wa_template_category') THEN
    CREATE TYPE cm_wa_template_category AS ENUM ('MARKETING','UTILITY','AUTHENTICATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cm_wa_template_quality') THEN
    CREATE TYPE cm_wa_template_quality AS ENUM ('GREEN','YELLOW','RED','UNKNOWN');
  END IF;
END $$;

-- =============================================================================
-- Tabla principal — cache local + fuente para el panel UI
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cm_wa_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NOT NULL REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  whatsapp_account_id  UUID NOT NULL REFERENCES public.cm_whatsapp_accounts(id) ON DELETE CASCADE,
  -- Meta side
  meta_id              TEXT,                           -- template id devuelto por Meta al crear
  name                 TEXT NOT NULL,                  -- snake_case
  language             TEXT NOT NULL,                  -- es_CO, en_US
  category             cm_wa_template_category NOT NULL DEFAULT 'UTILITY',
  status               cm_wa_template_status   NOT NULL DEFAULT 'PENDING',
  quality              cm_wa_template_quality  NOT NULL DEFAULT 'UNKNOWN',
  components           JSONB NOT NULL DEFAULT '[]'::jsonb,
  parameter_format     TEXT  NOT NULL DEFAULT 'POSITIONAL', -- 'POSITIONAL' | 'NAMED'
  rejection_reason     TEXT,
  previous_category    cm_wa_template_category,
  -- CM side
  tag                  TEXT,                           -- etiqueta libre
  created_by_cm_user_id UUID REFERENCES public.cm_users(id) ON DELETE SET NULL,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un (name, language) por WABA — es lo que Meta garantiza único.
CREATE UNIQUE INDEX IF NOT EXISTS cm_wa_tpl_account_name_lang
  ON public.cm_wa_templates (whatsapp_account_id, name, language);

CREATE INDEX IF NOT EXISTS cm_wa_tpl_client_status
  ON public.cm_wa_templates (client_id, status);

CREATE INDEX IF NOT EXISTS cm_wa_tpl_meta_id
  ON public.cm_wa_templates (meta_id) WHERE meta_id IS NOT NULL;

-- =============================================================================
-- Webhook idempotency — evita procesar dos veces el mismo event
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cm_wa_webhook_events (
  id           BIGSERIAL PRIMARY KEY,
  event_key    TEXT NOT NULL UNIQUE,   -- hash payload o waba_id+field+meta_id+timestamp
  waba_id      TEXT NOT NULL,
  field        TEXT NOT NULL,          -- message_template_status_update, template_category_update, etc.
  payload      JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cm_wa_webhook_events_waba
  ON public.cm_wa_webhook_events (waba_id, processed_at DESC);

-- =============================================================================
-- Log opcional de envíos — auditoría + debug (sin cuerpo del mensaje entero)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cm_wa_template_sends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  whatsapp_account_id UUID NOT NULL REFERENCES public.cm_whatsapp_accounts(id) ON DELETE CASCADE,
  template_id         UUID REFERENCES public.cm_wa_templates(id) ON DELETE SET NULL,
  to_phone            TEXT NOT NULL,
  template_name       TEXT NOT NULL,
  language            TEXT NOT NULL,
  wamid               TEXT,                  -- id de Meta (messages.id)
  status              TEXT NOT NULL DEFAULT 'queued',  -- queued|sent|delivered|read|failed
  error               JSONB,
  sent_by_cm_user_id  UUID REFERENCES public.cm_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cm_wa_template_sends_client_created
  ON public.cm_wa_template_sends (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cm_wa_template_sends_wamid
  ON public.cm_wa_template_sends (wamid) WHERE wamid IS NOT NULL;

-- =============================================================================
-- RLS — permissive (enforcement real en getCmClientAccess). Mismo pattern que
-- el resto de tablas cm_* según comentario largo en cm-client-access.ts.
-- =============================================================================
ALTER TABLE public.cm_wa_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_wa_webhook_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_wa_template_sends  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_wa_templates_all       ON public.cm_wa_templates;
DROP POLICY IF EXISTS cm_wa_webhook_events_all  ON public.cm_wa_webhook_events;
DROP POLICY IF EXISTS cm_wa_template_sends_all  ON public.cm_wa_template_sends;

CREATE POLICY cm_wa_templates_all       ON public.cm_wa_templates       USING (true) WITH CHECK (true);
CREATE POLICY cm_wa_webhook_events_all  ON public.cm_wa_webhook_events  USING (true) WITH CHECK (true);
CREATE POLICY cm_wa_template_sends_all  ON public.cm_wa_template_sends  USING (true) WITH CHECK (true);

-- =============================================================================
-- Trigger updated_at (usa función local; no depende de touch_updated_at global)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cm_wa_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cm_wa_templates_touch      ON public.cm_wa_templates;
DROP TRIGGER IF EXISTS cm_wa_template_sends_touch ON public.cm_wa_template_sends;

CREATE TRIGGER cm_wa_templates_touch
  BEFORE UPDATE ON public.cm_wa_templates
  FOR EACH ROW EXECUTE FUNCTION public.cm_wa_touch_updated_at();

CREATE TRIGGER cm_wa_template_sends_touch
  BEFORE UPDATE ON public.cm_wa_template_sends
  FOR EACH ROW EXECUTE FUNCTION public.cm_wa_touch_updated_at();

-- =============================================================================
-- Comentarios (autodocumentación)
-- =============================================================================
COMMENT ON TABLE  public.cm_wa_templates IS 'Cache local de WhatsApp Business Platform message templates. Fuente de verdad = Meta; local reflejado via sync + webhooks.';
COMMENT ON COLUMN public.cm_wa_templates.meta_id IS 'ID numérico de Meta para el template (no wamid). NULL mientras PENDING previo al primer sync.';
COMMENT ON COLUMN public.cm_wa_templates.components IS 'Array JSON con HEADER/BODY/FOOTER/BUTTONS. Estructura definida por Graph API v26.0.';
COMMENT ON COLUMN public.cm_wa_templates.parameter_format IS 'POSITIONAL (default, {{1}}) o NAMED ({{nombre}}). No se puede mezclar.';
COMMENT ON TABLE  public.cm_wa_webhook_events IS 'Log de webhooks Meta con dedup por event_key. TTL manual (borrar >90d).';
COMMENT ON TABLE  public.cm_wa_template_sends IS 'Auditoría de envíos con template. Se actualiza via webhook messages.status.';
