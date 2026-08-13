-- Sprint · Selección explícita de página/cuenta en el OAuth de Meta
-- ===========================================================================
-- ESTADO: APLICADA el 13 de agosto de 2026. Confirmada por el propietario.
--
-- Por qué hace falta una tabla
-- ----------------------------
-- El callback de OAuth resolvía la página con `pages[0]`: la primera que
-- devolviera Meta, que no tiene por qué ser la que el usuario seleccionó en el
-- diálogo. Con varias páginas administradas, la marca podía quedarse con la
-- equivocada, y la misma página podía acabar en dos marcas distintas.
--
-- La corrección exige pedir al usuario que elija. Entre el callback y esa
-- elección hay que guardar en algún sitio los candidatos **y los tokens ya
-- intercambiados**: el `code` de OAuth es de un solo uso, así que no se puede
-- repetir el intercambio después.
--
-- Qué NO se hace
-- --------------
--   * **Ningún índice UNIQUE sobre activos existentes.** El requisito es
--     explícito: primero auditar los duplicados que ya haya
--     (`scripts/audit-meta-duplicates.mjs`), documentarlos y corregirlos; la
--     unicidad se evaluará en una migración aparte.
--   * No se toca `cm_social_accounts`, `cm_whatsapp_accounts` ni
--     `smarttalk.channels`.
--   * No se borra ninguna conexión existente.
--
-- ===========================================================================
-- Selecciones pendientes
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.cm_oauth_pending_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quién, dónde y para qué marca. Los tres se comprueban al consumir la
  -- selección: un identificador filtrado no sirve de nada sin la sesión del
  -- usuario que inició el flujo.
  cm_user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,

  flow TEXT NOT NULL CHECK (flow IN ('facebook', 'facebook_instagram_ads')),

  -- Lo que SÍ ve el navegador: nombre, id de la página y, para Instagram, el
  -- usuario asociado. Sin tokens de ningún tipo.
  candidates JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Lo que NO ve el navegador: los tokens ya intercambiados, cifrados con
  -- AES-256-GCM por `encryptToken`, igual que en cm_social_accounts. Se guardan
  -- porque el `code` de OAuth es de un solo uso y no se puede volver a canjear.
  payload_ciphertext TEXT NOT NULL,

  -- Ventana corta: es material sensible esperando una decisión humana.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consulta caliente: «selecciones vivas de este usuario».
CREATE INDEX IF NOT EXISTS idx_cm_oauth_pending_selections_owner
  ON public.cm_oauth_pending_selections(cm_user_id, client_id)
  WHERE consumed_at IS NULL;

-- Para la purga por antigüedad.
CREATE INDEX IF NOT EXISTS idx_cm_oauth_pending_selections_expires
  ON public.cm_oauth_pending_selections(expires_at);

ALTER TABLE public.cm_oauth_pending_selections ENABLE ROW LEVEL SECURITY;

-- Sólo `service_role`. El navegador nunca lee esta tabla directamente: recibe
-- los candidatos ya filtrados por la ruta, que además quita los tokens.
DROP POLICY IF EXISTS cm_oauth_pending_selections_service_only
  ON public.cm_oauth_pending_selections;
CREATE POLICY cm_oauth_pending_selections_service_only
  ON public.cm_oauth_pending_selections
  FOR ALL TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

COMMENT ON TABLE public.cm_oauth_pending_selections IS
  'Candidatos de página/cuenta entre el callback de Meta y la elección del usuario. Efímera: expira a los 30 minutos y se consume una sola vez.';
COMMENT ON COLUMN public.cm_oauth_pending_selections.payload_ciphertext IS
  'Tokens de OAuth cifrados (AES-256-GCM). Nunca se exponen al navegador.';

-- ===========================================================================
-- Notas de operación
-- ===========================================================================
-- * Purga: las filas caducadas se borran de forma perezosa al crear una nueva
--   selección del mismo usuario. No hace falta un cron dedicado por el volumen
--   esperado; si creciera, `DELETE FROM public.cm_oauth_pending_selections
--   WHERE expires_at < NOW()` es seguro en cualquier momento.
-- * Rollback: `DROP TABLE IF EXISTS public.cm_oauth_pending_selections;`. No
--   hay dependencias, y perder selecciones a medias sólo obliga a repetir el
--   OAuth.
