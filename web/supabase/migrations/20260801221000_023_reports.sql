-- Sprint 26 · Agente P — Reports PDF marca blanca + envío por email.
--
-- Contexto:
--   Sprint 25 dejó el dashboard `/analytics` con botón "Exportar PDF" stub.
--   Este sprint cierra el loop: PDF branded + persistencia + email opcional.
--
-- Tabla:
--   cm_reports — un row por PDF generado. `branding` guarda snapshot de la
--   apariencia usada (agency name, colores, logo) para que el PDF sea
--   reproducible aunque cambie la marca de la agencia después.
--
-- Storage:
--   El PDF vive en Supabase Storage (bucket `cm-assets`, subcarpeta
--   `reports/<org_id>/<report_id>.pdf`). `storage_path` guarda la key.
--   `public_url` = signed URL pública (con TTL) o URL pública si el bucket
--   se configura como público. La lib de reports decide.
--
-- RLS:
--   Igual patrón que analytics/otros: aislamiento por organization_id via
--   smarttalk.get_agent_org_id(). El service role usado por la ruta hace
--   bypass — no depende de RLS para insert.

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.cm_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'quarterly', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'sent', 'failed')),
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { logo_url, primary_color, secondary_color, agency_name, agency_footer }
  storage_path TEXT,
  public_url TEXT,
  size_bytes BIGINT,
  sent_to_email TEXT,
  sent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { include_insights: bool, insights_cost_usd: number, generation_ms: int, error?: string }
  generated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_reports_client_period
  ON public.cm_reports (client_id, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_cm_reports_org
  ON public.cm_reports (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cm_reports_status
  ON public.cm_reports (organization_id, status, created_at DESC);

ALTER TABLE public.cm_reports ENABLE ROW LEVEL SECURITY;

-- Aislamiento por organización — misma convención que cm_metrics_account.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE tablename = 'cm_reports'
      AND policyname = 'cm_reports_org_isolation'
  ) THEN
    CREATE POLICY "cm_reports_org_isolation"
      ON public.cm_reports
      FOR ALL
      USING (
        organization_id = (
          SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.cm_reports IS
  'Sprint 26: PDF reports generados para clientes con branding de la agencia. PDF vive en Storage; esta tabla persiste metadata + link.';
