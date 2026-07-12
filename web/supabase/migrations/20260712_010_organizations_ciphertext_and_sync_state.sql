-- Sprint 4:
-- (a) columna ciphertext en smarttalk.organizations para eliminar el último
--     lugar donde vive un access_token en claro
-- (b) tabla inbox_sync_state para reemplazar el Map in-memory del sync de Instagram
--     (que no funciona en serverless multi-instancia)

SET search_path TO smarttalk, public, auth, extensions;

-- ============================================================================
-- (a) smarttalk.organizations.access_token_ciphertext
-- ============================================================================
ALTER TABLE smarttalk.organizations
  ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT;

COMMENT ON COLUMN smarttalk.organizations.access_token_ciphertext IS
  'AES-256-GCM base64 payload. Preferir sobre access_token (plano legacy).';

-- ============================================================================
-- (b) smarttalk.inbox_sync_state
--     Una fila por (organization_id, resource). Sirve para throttling de syncs
--     que deben deduplicarse entre workers Vercel.
-- ============================================================================
CREATE TABLE IF NOT EXISTS smarttalk.inbox_sync_state (
  organization_id UUID NOT NULL REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, resource)
);

ALTER TABLE smarttalk.inbox_sync_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'smarttalk' AND tablename = 'inbox_sync_state' AND policyname = 'inbox_sync_state_own_org'
  ) THEN
    CREATE POLICY "inbox_sync_state_own_org"
      ON smarttalk.inbox_sync_state FOR ALL
      USING (organization_id = get_agent_org_id());
  END IF;
END $$;

COMMENT ON TABLE smarttalk.inbox_sync_state IS
  'Throttle serverless-safe para syncs periódicos (ej. Instagram inbox pull).';
