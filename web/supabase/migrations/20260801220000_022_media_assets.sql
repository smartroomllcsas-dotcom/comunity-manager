-- Sprint 26 · Media Assets pipeline
-- ---------------------------------------------------------------------------
-- Cierra la deuda del Sprint 24 (PostEditor recibia URLs via window.prompt).
-- Cataloga assets subidos manualmente o generados con IA (Fal.ai) que viven
-- en el bucket 'cm-assets' de Supabase Storage, siempre bajo nuestro dominio.
--
-- Tabla:
--   public.cm_media_assets  - metadata + reverso path->URL. Isolado por
--                             organization_id (RLS via smarttalk.get_agent_org_id()).
--
-- Origen ('origin'):
--   upload      - subida manual desde AssetBrowser (POST /api/media/upload)
--   fal-flux    - imagen generada con fal-ai/flux-pro
--   fal-kling   - video generado con fal-ai/kling-video
--   fal-veo     - video generado con fal-ai/veo
--   other-ai    - otras integraciones de IA (futuro)
--   import      - importado desde URL externa
--
-- RLS: aislamiento por organization_id via smarttalk.get_agent_org_id().

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.cm_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'cm-assets',
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC(8,2),
  origin TEXT NOT NULL CHECK (origin IN ('upload','fal-flux','fal-kling','fal-veo','other-ai','import')),
  origin_metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_cm_media_assets_client
  ON public.cm_media_assets (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cm_media_assets_org
  ON public.cm_media_assets (organization_id, created_at DESC);

ALTER TABLE public.cm_media_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE tablename = 'cm_media_assets'
      AND policyname = 'cm_media_assets_org_isolation'
  ) THEN
    CREATE POLICY "cm_media_assets_org_isolation" ON public.cm_media_assets
      FOR ALL USING (organization_id = (SELECT smarttalk.get_agent_org_id() FROM auth.users LIMIT 1));
  END IF;
END $$;
