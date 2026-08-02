-- Sprint 25 · Community Listening + Brand Health Score
-- ---------------------------------------------------------------------------
-- Diferenciador clave (analisis Sprint 22, 04_MARKETING_SCHEDULING.md G-5):
-- monitoreo de menciones cross-platform + sentiment analysis (Haiku) +
-- alertas cuando algo se vuelve viral (positivo o negativo).
--
-- Tablas:
--  * public.cm_mentions            - mentions crudas por canal, con sentiment
--                                    y triage (urgency, intent). UNIQUE
--                                    (platform, source_url, author_handle)
--                                    previene duplicados en re-fetch.
--  * public.cm_brand_health_scores - snapshot hora-a-hora del health score
--                                    (0-100) + deltas + crisis flag.
--
-- RLS: aislamiento por organization_id via smarttalk.get_agent_org_id().

SET search_path TO public, extensions;

-- ---------------------------------------------------------------------------
-- 1. cm_mentions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cm_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  platform TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('mention','comment','dm','review','tag','share')),
  source_url TEXT,
  author_handle TEXT,
  author_followers INTEGER,
  content TEXT NOT NULL,
  language TEXT DEFAULT 'es',
  sentiment_score NUMERIC(4,3),  -- -1.0 (negative) to +1.0 (positive)
  sentiment_label TEXT CHECK (sentiment_label IN ('positive','neutral','negative')),
  intent_label TEXT,             -- 'complaint','praise','question','spam','sales_intent','crisis'
  urgency_score INTEGER CHECK (urgency_score BETWEEN 1 AND 5),
  is_processed BOOLEAN NOT NULL DEFAULT false,
  responded_at TIMESTAMPTZ,
  responded_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, source_url, author_handle)
);

CREATE INDEX IF NOT EXISTS idx_cm_mentions_client_time
  ON public.cm_mentions (client_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_cm_mentions_unprocessed
  ON public.cm_mentions (client_id)
  WHERE is_processed = false;

CREATE INDEX IF NOT EXISTS idx_cm_mentions_urgent
  ON public.cm_mentions (client_id, urgency_score DESC)
  WHERE urgency_score >= 4;

-- ---------------------------------------------------------------------------
-- 2. cm_brand_health_scores
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cm_brand_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_hours INTEGER NOT NULL DEFAULT 24,
  mentions_count INTEGER NOT NULL DEFAULT 0,
  sentiment_avg NUMERIC(4,3),
  sentiment_delta_pct NUMERIC(6,3),  -- % change vs previous window
  positive_pct NUMERIC(5,2),
  neutral_pct NUMERIC(5,2),
  negative_pct NUMERIC(5,2),
  crisis_triggered BOOLEAN NOT NULL DEFAULT false,
  health_score INTEGER,              -- 0-100 composite
  UNIQUE (client_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_cm_brand_health_client
  ON public.cm_brand_health_scores (client_id, snapshot_at DESC);

-- ---------------------------------------------------------------------------
-- 3. RLS - aislamiento por organization_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.cm_mentions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cm_brand_health_scores  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cm_mentions'
      AND policyname = 'cm_mentions_org_isolation'
  ) THEN
    CREATE POLICY "cm_mentions_org_isolation"
      ON public.cm_mentions
      FOR ALL
      USING (
        organization_id = (
          SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cm_brand_health_scores'
      AND policyname = 'cm_brand_health_scores_org_isolation'
  ) THEN
    CREATE POLICY "cm_brand_health_scores_org_isolation"
      ON public.cm_brand_health_scores
      FOR ALL
      USING (
        organization_id = (
          SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1
        )
      );
  END IF;
END $$;
