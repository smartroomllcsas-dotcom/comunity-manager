-- Sprint 25 · Analytics unificadas cross-canal (Agente K)
--
-- Contexto:
--  * Sprint 22 añadió `platform_post_id` en `cm_scheduled_posts` (migración 017)
--    para poder consultar métricas de cada post en la API nativa de cada canal.
--  * Sprint 25 cierra el loop: snapshotea métricas por post + por cuenta cada
--    hora (post) / cada 24h (account) desde un cron Inngest, y sirve
--    agregaciones en `/api/analytics` para el dashboard cliente + agencia.
--
-- Contrato:
--  * `cm_metrics_post`   → un row por (post, snapshot_at). Los snapshots
--    permiten graficar evolución temporal de un mismo post.
--  * `cm_metrics_account` → un row por (social_account, snapshot_at). Sirve
--    para gráficos followers + engagement rate 30d.
--  * `raw_payload` guarda la respuesta cruda del provider por si necesitamos
--    re-parsear métricas nuevas sin re-llamar a la API.
--
-- Idempotencia: UNIQUE (post_id, snapshot_at) evita snapshots duplicados si
-- el cron corre dos veces en la misma hora (retry Inngest, etc.).

SET search_path TO public, extensions;

-- ---------------------------------------------------------------------------
-- 1. cm_metrics_post — snapshot de métricas por post individual
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cm_metrics_post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  social_account_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_post_id TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  video_views BIGINT DEFAULT 0,
  video_completion_rate NUMERIC(5,4),  -- 0.0 - 1.0
  engagement_rate NUMERIC(5,4),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_cm_metrics_post_lookup
  ON public.cm_metrics_post (post_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_metrics_post_platform
  ON public.cm_metrics_post (platform, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_metrics_post_account
  ON public.cm_metrics_post (social_account_id, snapshot_at DESC);

COMMENT ON TABLE  public.cm_metrics_post IS
  'Sprint 25 · Snapshot horario de métricas por post publicado (Meta/TikTok/LinkedIn/Threads).';
COMMENT ON COLUMN public.cm_metrics_post.raw_payload IS
  'Respuesta cruda del provider (útil para re-parseo sin re-llamar API).';

-- ---------------------------------------------------------------------------
-- 2. cm_metrics_account — snapshot de métricas por cuenta social
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cm_metrics_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL,
  client_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  platform TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  followers BIGINT DEFAULT 0,
  followers_delta_30d BIGINT DEFAULT 0,
  posts_published_30d INTEGER DEFAULT 0,
  total_engagement_30d BIGINT DEFAULT 0,
  avg_engagement_rate_30d NUMERIC(5,4),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (social_account_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_cm_metrics_account_client
  ON public.cm_metrics_account (client_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_metrics_account_org
  ON public.cm_metrics_account (organization_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_metrics_account_platform
  ON public.cm_metrics_account (platform, snapshot_at DESC);

COMMENT ON TABLE  public.cm_metrics_account IS
  'Sprint 25 · Snapshot diario (24h) de métricas por cuenta social. Alimenta dashboards.';

-- ---------------------------------------------------------------------------
-- 3. RLS — aislamiento por organization_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.cm_metrics_post    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_metrics_account ENABLE ROW LEVEL SECURITY;

-- cm_metrics_account: aislamiento directo por organization_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cm_metrics_account'
      AND policyname = 'cm_metrics_account_org_isolation'
  ) THEN
    CREATE POLICY "cm_metrics_account_org_isolation"
      ON public.cm_metrics_account
      FOR SELECT
      USING (
        organization_id = (
          SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1
        )
      );
  END IF;
END $$;

-- cm_metrics_post: aislamiento via join a cm_social_accounts.organization_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cm_metrics_post'
      AND policyname = 'cm_metrics_post_org_isolation'
  ) THEN
    CREATE POLICY "cm_metrics_post_org_isolation"
      ON public.cm_metrics_post
      FOR SELECT
      USING (
        social_account_id IN (
          SELECT id FROM public.cm_social_accounts
          WHERE organization_id = (
            SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1
          )
        )
      );
  END IF;
END $$;
