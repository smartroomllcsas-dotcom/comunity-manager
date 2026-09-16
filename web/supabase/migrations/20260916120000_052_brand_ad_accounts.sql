-- 052 · Cuenta publicitaria por marca (conexión de publicación y anuncios)
--
-- Separada a propósito de `channels`, que guarda los canales de conversación.
-- Hasta ahora una sola conexión de Meta alimentaba las dos cosas: cualquier
-- permiso nuevo para publicar o pautar entraba en el mismo diálogo que usan las
-- marcas para conectar Messenger e Instagram, y un permiso sin aprobar tumbaba
-- la conexión del chat de todas a la vez (pasó el 11 de septiembre con
-- pages_read_user_content). Con la tabla y el flujo aparte, un fallo aquí se
-- queda aquí.
--
-- El token va cifrado (AES-256-GCM, mismo formato `v1:` que channels).
-- Idempotente.
SET search_path TO smarttalk, public;

CREATE TABLE IF NOT EXISTS smarttalk.brand_ad_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL,
  brand_id           UUID NOT NULL,
  -- Cuenta elegida para esta marca (sin el prefijo act_).
  ad_account_id      TEXT,
  ad_account_name    TEXT,
  business_id        TEXT,
  -- Todas las cuentas que devolvió Meta, para poder cambiar de una a otra sin
  -- volver a pasar por el diálogo.
  available_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_token_ciphertext TEXT,
  token_expires_at   TIMESTAMPTZ,
  scopes             TEXT[] NOT NULL DEFAULT '{}',
  connected_by       UUID,
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una conexión por marca: reconectar actualiza la fila, no la duplica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_ad_accounts_brand
  ON smarttalk.brand_ad_accounts (brand_id);

CREATE INDEX IF NOT EXISTS idx_brand_ad_accounts_org
  ON smarttalk.brand_ad_accounts (organization_id);

ALTER TABLE smarttalk.brand_ad_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_ad_accounts_service ON smarttalk.brand_ad_accounts;
CREATE POLICY brand_ad_accounts_service ON smarttalk.brand_ad_accounts
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
