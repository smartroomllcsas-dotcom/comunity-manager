-- =============================================================================
-- Sprint 22 · Hardening · Cifrado AES-256-GCM de access tokens
-- =============================================================================
--
-- Contexto:
-- Las columnas *_ciphertext ya fueron creadas en la migración 009 (hardening
-- del Sprint 2) y en la 010 (organizations). Esta migración es una migración
-- "soft" que garantiza la existencia de las columnas requeridas (idempotente
-- con IF NOT EXISTS) y añade cualquier columna faltante para tokens auxiliares
-- que quedaron pendientes de re-cifrar.
--
-- Estrategia (spec Sprint 22, Hallazgo #1):
--   - Se mantiene la columna vieja `access_token` para migración progresiva.
--   - La app lee primero `_ciphertext` (AES-256-GCM base64 con formato
--     v1:iv||tag||ct); si es NULL, cae a la legacy plain y la re-cifra en el
--     siguiente write.
--   - Sprint 23 podrá borrar las columnas legacy una vez todos los tokens
--     estén cifrados (correr scripts/reencrypt-tokens.mjs antes).
--
-- Formato ciphertext: v1:<base64(iv[12])>:<base64(tag[16])>:<base64(ct)>
-- Env var:            TOKEN_ENCRYPTION_KEY (32 bytes base64 o hex)
--                     Generar: openssl rand -base64 32
-- =============================================================================

-- -----------------------------------------------------------------------------
-- smarttalk.channels — token principal del canal (WhatsApp / Meta)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS smarttalk.channels
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT;

COMMENT ON COLUMN smarttalk.channels.access_token_ciphertext IS
  'AES-256-GCM ciphertext base64. Formato: v1:iv[12]||tag[16]||ciphertext. Sprint 22. Preferir sobre access_token (plano legacy).';

-- -----------------------------------------------------------------------------
-- public.cm_social_accounts — tokens de Facebook/Instagram/Ads (Meta OAuth)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cm_social_accounts
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS page_access_token_ciphertext TEXT;

COMMENT ON COLUMN public.cm_social_accounts.access_token_ciphertext IS
  'AES-256-GCM ciphertext base64 (formato v1:iv||tag||ct). Sprint 22.';
COMMENT ON COLUMN public.cm_social_accounts.page_access_token_ciphertext IS
  'AES-256-GCM ciphertext base64 (formato v1:iv||tag||ct). Sprint 22. Cubre page_access_token legacy.';

-- -----------------------------------------------------------------------------
-- public.cm_whatsapp_accounts — access_token de la cuenta WhatsApp del cliente
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cm_whatsapp_accounts
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT;

COMMENT ON COLUMN public.cm_whatsapp_accounts.access_token_ciphertext IS
  'AES-256-GCM ciphertext base64 (formato v1:iv||tag||ct). Sprint 22.';

-- -----------------------------------------------------------------------------
-- smarttalk.organizations — token histórico a nivel organización
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS smarttalk.organizations
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT;

COMMENT ON COLUMN smarttalk.organizations.access_token_ciphertext IS
  'AES-256-GCM ciphertext base64 (formato v1:iv||tag||ct). Sprint 22.';

-- =============================================================================
-- Nota operativa
-- =============================================================================
-- 1. Configurar TOKEN_ENCRYPTION_KEY en el entorno antes de desplegar la app
--    (openssl rand -base64 32).
-- 2. Correr una vez el script one-off para re-cifrar filas legacy:
--       node scripts/reencrypt-tokens.mjs
--    (o el alias scripts/encrypt-existing-tokens.mjs — mismo script).
-- 3. En Sprint 23, cuando SELECT count(*) donde access_token IS NOT NULL AND
--    access_token_ciphertext IS NULL sea cero, se podrá DROP COLUMN
--    access_token (y page_access_token) en una migración separada.
-- =============================================================================
