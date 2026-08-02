-- Sprint 22 · Motor de scheduling (Inngest) + multi-tenant social accounts
--
-- Contexto:
--  * `public.cm_scheduled_posts` (creada en 20260509_meta_flow.sql) recibe una
--    columna `inngest_event_id` para trackear el evento emitido y evitar
--    doble-emisión desde el reaper.
--  * `public.cm_social_accounts` ya existe (migración 008 le agregó columnas
--    para el flujo Meta). Esta migración es aditiva: crea la tabla si no
--    existe (nueva instancia) y añade las columnas del contrato multi-tenant
--    de Sprint 22 vía ALTER TABLE ADD COLUMN IF NOT EXISTS.
--  * La columna `access_token_encrypted` es el CONTRATO con el agente 3
--    (formato AES-256-GCM base64, migración 015).

SET search_path TO public, extensions;

-- ---------------------------------------------------------------------------
-- 1. cm_social_accounts — crear (si no existe) o extender columnas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cm_social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN (
    'facebook','instagram','whatsapp','tiktok',
    'linkedin','x','youtube','threads','pinterest','gbp'
  )),
  account_id TEXT NOT NULL,
  account_name TEXT,
  access_token_encrypted TEXT,     -- AES-256-GCM base64 (ver migr. 015)
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  page_id TEXT,
  ig_user_id TEXT,
  scopes TEXT[],
  connected_by UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','expired','revoked','error'
  )),
  last_health_check_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive: si la tabla ya existía (caso Sprint <22), añadir columnas nuevas.
ALTER TABLE public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS ig_user_id TEXT,
  ADD COLUMN IF NOT EXISTS connected_by UUID,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS account_id TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT;

-- Constraints y unique idempotentes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_social_accounts_status_check'
  ) THEN
    ALTER TABLE public.cm_social_accounts
      ADD CONSTRAINT cm_social_accounts_status_check
      CHECK (status IN ('active','expired','revoked','error'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_social_accounts_platform_check'
  ) THEN
    ALTER TABLE public.cm_social_accounts
      ADD CONSTRAINT cm_social_accounts_platform_check
      CHECK (platform IN (
        'facebook','instagram','whatsapp','tiktok',
        'linkedin','x','youtube','threads','pinterest','gbp'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_social_accounts_org_client_platform_account_key'
  ) THEN
    ALTER TABLE public.cm_social_accounts
      ADD CONSTRAINT cm_social_accounts_org_client_platform_account_key
      UNIQUE (organization_id, client_id, platform, account_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cm_social_accounts_client
  ON public.cm_social_accounts (client_id);
CREATE INDEX IF NOT EXISTS idx_cm_social_accounts_org
  ON public.cm_social_accounts (organization_id);
CREATE INDEX IF NOT EXISTS idx_cm_social_accounts_expiring
  ON public.cm_social_accounts (token_expires_at)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 2. RLS multi-tenant (policy idempotente vía DO block, ya que CREATE POLICY
--    IF NOT EXISTS no está disponible en Postgres <16 estable).
-- ---------------------------------------------------------------------------

ALTER TABLE public.cm_social_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cm_social_accounts'
      AND policyname = 'cm_social_accounts_org_isolation'
  ) THEN
    CREATE POLICY cm_social_accounts_org_isolation
      ON public.cm_social_accounts
      FOR ALL
      USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Tracking Inngest en cm_scheduled_posts
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.cm_scheduled_posts
  ADD COLUMN IF NOT EXISTS inngest_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cm_scheduled_posts_pending
  ON public.cm_scheduled_posts (scheduled_date)
  WHERE status = 'scheduled' AND inngest_event_id IS NULL;
