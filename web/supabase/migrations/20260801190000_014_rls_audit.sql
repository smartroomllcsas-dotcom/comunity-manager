-- Sprint 22 · RLS audit
-- Objetivo: garantizar que TODAS las tablas críticas cm_* (public) y las tablas
-- multi-tenant en smarttalk tengan RLS habilitado con la policy adecuada.
--
-- Contexto observado en migraciones previas:
--   * `smarttalk.contacts`, `conversations`, `messages`, `channels` YA tienen RLS
--     y policies "*_own_org_brand" desde 20260730000300_013_brand_channel_lead_isolation.
--     El patrón multi-tenant real es:
--         organization_id = smarttalk.get_agent_org_id()
--         AND smarttalk.current_agent_can_access_brand(brand_id)
--     NO es `auth.jwt() ->> 'organization_id'` (el JWT no lleva ese claim).
--   * `public.cm_oauth_states`, `cm_social_accounts`, `cm_whatsapp_accounts` ya
--     tienen RLS + policies `*_service_only` (deny total a authenticated/anon;
--     solo service role las lee) desde 20260712_009_hardening.
--   * Las tablas cm_scheduled_posts, cm_activity_logs, cm_chat_messages,
--     cm_agents, cm_content_pillars, cm_clients viven principalmente en el
--     backend MySQL legacy (ver src/lib/mysql.ts). En Postgres solo existe una
--     `public.cm_clients` referenciada por ALTER (bridge) — el resto puede o
--     no estar presente. Esta migración es defensiva: ENABLE RLS solo si la
--     tabla existe y aplica el patrón service_only (misma familia que 009).
--
-- Toda la migración es idempotente: usa IF EXISTS y checks contra pg_policies.
-- Postgres 15 no soporta `CREATE POLICY IF NOT EXISTS`, así que envolvemos con
-- bloques DO $$ para reflejar el mismo estilo de 009_hardening.

SET search_path TO smarttalk, public, auth, extensions;

-- ============================================================================
-- 1) RLS defensivo en tablas smarttalk (ya está habilitado; belt-and-braces)
-- ============================================================================

ALTER TABLE IF EXISTS smarttalk.channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS smarttalk.contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS smarttalk.conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS smarttalk.messages        ENABLE ROW LEVEL SECURITY;

-- Las policies "*_own_org_brand" ya existen desde 013_brand_channel_lead_isolation.
-- No las duplicamos. Si alguien deshabilitó RLS manualmente, el ALTER de arriba
-- lo re-habilita sin borrar policies existentes.

-- ============================================================================
-- 2) RLS defensivo en public.cm_* (viven mayormente en MySQL, pero por si acaso)
-- ============================================================================

-- Estas tres YA están cubiertas por 009_hardening, pero ENABLE es idempotente.
ALTER TABLE IF EXISTS public.cm_oauth_states     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cm_social_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cm_whatsapp_accounts ENABLE ROW LEVEL SECURITY;

-- Tablas potenciales del ERD original de Community Manager. Si existen en
-- Postgres, deben quedar bajo el mismo régimen service_only. Si no existen
-- (siguen solo en MySQL), el ALTER IF EXISTS es no-op silencioso.
ALTER TABLE IF EXISTS public.cm_scheduled_posts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cm_activity_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cm_chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cm_agents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cm_content_pillars  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cm_clients          ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3) Policies service_only faltantes en public.cm_* (patrón 009_hardening)
--    Regla: rechazar TODO acceso desde authenticated/anon. Service role bypass.
--    App Layer siempre usa createAdminClient() para estas tablas.
-- ============================================================================

DO $$
BEGIN
  -- cm_scheduled_posts
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='cm_scheduled_posts')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public'
                       AND tablename='cm_scheduled_posts'
                       AND policyname='cm_scheduled_posts_service_only') THEN
    CREATE POLICY "cm_scheduled_posts_service_only"
      ON public.cm_scheduled_posts FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;

  -- cm_activity_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='cm_activity_logs')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public'
                       AND tablename='cm_activity_logs'
                       AND policyname='cm_activity_logs_service_only') THEN
    CREATE POLICY "cm_activity_logs_service_only"
      ON public.cm_activity_logs FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;

  -- cm_chat_messages
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='cm_chat_messages')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public'
                       AND tablename='cm_chat_messages'
                       AND policyname='cm_chat_messages_service_only') THEN
    CREATE POLICY "cm_chat_messages_service_only"
      ON public.cm_chat_messages FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;

  -- cm_agents
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='cm_agents')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public'
                       AND tablename='cm_agents'
                       AND policyname='cm_agents_service_only') THEN
    CREATE POLICY "cm_agents_service_only"
      ON public.cm_agents FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;

  -- cm_content_pillars
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='cm_content_pillars')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public'
                       AND tablename='cm_content_pillars'
                       AND policyname='cm_content_pillars_service_only') THEN
    CREATE POLICY "cm_content_pillars_service_only"
      ON public.cm_content_pillars FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;

  -- cm_clients (bridge existe en Postgres via 008_cm_smarttalk_bridge, pero la
  -- tabla base vive en MySQL; solo se agregan columnas por ALTER. Cubrimos por
  -- si en el futuro se materializa el CREATE TABLE completo aquí.)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='cm_clients')
     AND NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname='public'
                       AND tablename='cm_clients'
                       AND policyname='cm_clients_service_only') THEN
    CREATE POLICY "cm_clients_service_only"
      ON public.cm_clients FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- ============================================================================
-- 4) Comentarios de trazabilidad
-- ============================================================================

COMMENT ON SCHEMA smarttalk IS
  'Multi-tenant schema. Aislamiento vía smarttalk.get_agent_org_id() + smarttalk.current_agent_can_access_brand(brand_id). Ver migración 013.';
