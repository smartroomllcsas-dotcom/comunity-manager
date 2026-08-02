-- Sprint 24 · Editor visual de posts con preview por canal + CRUD drafts.
--
-- Contexto:
--  * `public.cm_scheduled_posts` vive históricamente en MySQL legacy
--    (ver 20260801190000_014_rls_audit.sql). En Supabase existe solo si otra
--    migración la creó. Usamos ALTER TABLE IF EXISTS para ser defensivos:
--    en Postgres actualiza el schema, en MySQL es no-op.
--  * Esta migración extiende cm_scheduled_posts para soportar posts
--    multi-plataforma con contenido rico (texto + media[] + platforms[]).
--  * El nuevo índice acelera el listado del composer (por cliente + estado
--    + fecha) que es la query dominante del endpoint GET /api/posts.
--
-- Contrato con Sprint 22:
--  * `status = 'scheduled'` + `scheduled_at` seteado → API emite
--    `cm/post.schedule.requested` (ver `src/lib/inngest/client.ts`).
--  * `inngest_event_id` (ya existe desde migr. 016) queda para tracking.
--
-- FIXME (futuros sprints):
--  * Aprobación cliente workflow: approved_by/approved_at ya reservados aquí.
--  * Recurring posts: requerirá tabla auxiliar cm_post_recurrence.
--  * Storage bucket para media (hoy media_urls[] guarda URLs directas).

SET search_path TO public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Extender cm_scheduled_posts para multi-plataforma + rich content
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.cm_scheduled_posts
  ADD COLUMN IF NOT EXISTS content TEXT,             -- copy principal (markdown-lite)
  ADD COLUMN IF NOT EXISTS media_urls TEXT[],        -- imágenes / videos (URLs)
  ADD COLUMN IF NOT EXISTS platforms TEXT[],         -- ['fb','ig-feed','ig-reel',...]
  ADD COLUMN IF NOT EXISTS scheduled_by UUID,        -- user que programó
  ADD COLUMN IF NOT EXISTS approved_by UUID,         -- workflow aprobación (futuro)
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Bogota';

-- ---------------------------------------------------------------------------
-- 2. Índice para el listado del composer (client + status + fecha DESC)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'cm_scheduled_posts')
  THEN
    CREATE INDEX IF NOT EXISTS idx_cm_scheduled_posts_client_status
      ON public.cm_scheduled_posts (client_id, status, scheduled_date DESC);
  END IF;
END $$;

COMMENT ON COLUMN public.cm_scheduled_posts.content     IS 'Copy principal del post (markdown-lite).';
COMMENT ON COLUMN public.cm_scheduled_posts.media_urls  IS 'Array de URLs de assets (imágenes/videos). FIXME: mover a Supabase Storage.';
COMMENT ON COLUMN public.cm_scheduled_posts.platforms   IS 'Targets: fb, ig-feed, ig-reel, ig-story, tiktok, linkedin-personal, linkedin-company, x, threads.';
COMMENT ON COLUMN public.cm_scheduled_posts.scheduled_by IS 'auth.uid() del usuario que programó (para RLS futuro y auditoría).';
COMMENT ON COLUMN public.cm_scheduled_posts.approved_by IS 'Workflow de aprobación cliente (Sprint futuro).';
COMMENT ON COLUMN public.cm_scheduled_posts.timezone    IS 'IANA tz del cliente (default America/Bogota).';
