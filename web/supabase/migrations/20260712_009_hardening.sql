-- Sprint 2 hardening: RLS restrictivo, idempotencia, trigger updated_at, columnas ciphertext.
-- Idempotente (usa IF EXISTS / IF NOT EXISTS y DO $$ ... $$).

-- ============================================================================
-- 1. RLS restrictivo en public.cm_* (solo service role puede acceder).
--    Motivo: hasta ahora la política era USING(true) — cualquier user autenticado
--    podía leer tokens de otros tenants. La app siempre usa service role para
--    estas tablas, así que restringir el rol authenticated no rompe nada.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cm_social_accounts' AND policyname='cm_social_accounts_own') THEN
    DROP POLICY "cm_social_accounts_own" ON public.cm_social_accounts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cm_oauth_states' AND policyname='cm_oauth_states_own') THEN
    DROP POLICY "cm_oauth_states_own" ON public.cm_oauth_states;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cm_whatsapp_accounts' AND policyname='cm_whatsapp_accounts_own') THEN
    DROP POLICY "cm_whatsapp_accounts_own" ON public.cm_whatsapp_accounts;
  END IF;
END $$;

-- Rechaza todo acceso desde roles anon/authenticated. Service role bypassea RLS.
CREATE POLICY "cm_social_accounts_service_only"
  ON public.cm_social_accounts FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "cm_oauth_states_service_only"
  ON public.cm_oauth_states FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "cm_whatsapp_accounts_service_only"
  ON public.cm_whatsapp_accounts FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- 2. Trigger updated_at en public.cm_social_accounts.
--    La columna updated_at existe (mig 008) pero no se auto-actualiza en UPDATE,
--    lo cual rompe el ORDER BY updated_at en instagram-sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cm_social_accounts_updated_at ON public.cm_social_accounts;
CREATE TRIGGER cm_social_accounts_updated_at
  BEFORE UPDATE ON public.cm_social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS cm_whatsapp_accounts_updated_at ON public.cm_whatsapp_accounts;
CREATE TRIGGER cm_whatsapp_accounts_updated_at
  BEFORE UPDATE ON public.cm_whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. UNIQUE indexes para idempotencia real (respalda ON CONFLICT DO NOTHING).
-- ============================================================================

-- Un mismo wa_message_id nunca puede duplicarse en una conversación.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_conv_wa_message_id
  ON smarttalk.messages(conversation_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- A lo sumo una conversación abierta/pendiente por (org, contact, channel).
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_open_per_channel
  ON smarttalk.conversations(organization_id, contact_id, channel_id)
  WHERE status IN ('open', 'pending') AND channel_id IS NOT NULL;

-- ============================================================================
-- 4. Índice para findMatchingChannel (evita seq scan por evento webhook).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_channels_meta_business_active
  ON smarttalk.channels(meta_business_id)
  WHERE status = 'active' AND meta_business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channels_phone_active
  ON smarttalk.channels(whatsapp_phone_number_id)
  WHERE status = 'active' AND whatsapp_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channels_waba_active
  ON smarttalk.channels(whatsapp_business_account_id)
  WHERE status = 'active' AND whatsapp_business_account_id IS NOT NULL;

-- ============================================================================
-- 5. Columnas ciphertext para migración progresiva de tokens.
--    La app leerá primero *_ciphertext (AES-256-GCM); si es NULL, cae a la
--    columna legacy y re-encripta en el siguiente write. Sin data-migration.
-- ============================================================================

ALTER TABLE public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS page_access_token_ciphertext TEXT;

ALTER TABLE public.cm_whatsapp_accounts
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT;

ALTER TABLE smarttalk.channels
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT;

COMMENT ON COLUMN public.cm_social_accounts.access_token_ciphertext IS
  'AES-256-GCM base64 payload. Preferir sobre access_token (plano legacy).';
COMMENT ON COLUMN public.cm_social_accounts.page_access_token_ciphertext IS
  'AES-256-GCM base64 payload. Preferir sobre page_access_token (plano legacy).';
COMMENT ON COLUMN public.cm_whatsapp_accounts.access_token_ciphertext IS
  'AES-256-GCM base64 payload. Preferir sobre access_token (plano legacy).';
COMMENT ON COLUMN smarttalk.channels.access_token_ciphertext IS
  'AES-256-GCM base64 payload. Preferir sobre access_token (plano legacy).';

-- ============================================================================
-- 6. Documentación del down-path (rollback manual, no ejecutable aquí).
--    Rollback:
--      - DROP columnas *_ciphertext (perdería tokens migrados)
--      - Restaurar policies USING(true) originales
--      - DROP UNIQUE indexes creados
--      - DROP TRIGGERs cm_*_updated_at
--    En producción con tokens ya migrados, primero mover ciphertext a claro,
--    luego drop columnas — NO ejecutar rollback destructivo sin este paso.
-- ============================================================================
