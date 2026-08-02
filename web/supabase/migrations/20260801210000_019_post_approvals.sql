-- Sprint 25 · Client approval workflow — magic-link portal (público sin auth).
--
-- Contexto:
--  * `cm_scheduled_posts` ya reserva approved_by/approved_at (mig 018).
--  * Aquí registramos cada request de aprobación: token hasheado, TTL,
--    respuesta del cliente (approve/reject + comentarios + identidad).
--  * NUNCA guardamos el token plain — solo SHA-256(token) para lookup.
--  * RLS: aisla por org de la agencia. El portal público NO usa esta tabla
--    directamente; sus endpoints usan el service role tras verificar HMAC.

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.cm_post_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  client_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  comments TEXT,
  responded_by_email TEXT,
  responded_by_name TEXT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_cm_post_approvals_post
  ON public.cm_post_approvals (post_id);

CREATE INDEX IF NOT EXISTS idx_cm_post_approvals_pending
  ON public.cm_post_approvals (expires_at)
  WHERE status = 'pending';

ALTER TABLE public.cm_post_approvals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cm_post_approvals'
      AND policyname = 'cm_post_approvals_org_isolation'
  ) THEN
    CREATE POLICY "cm_post_approvals_org_isolation"
      ON public.cm_post_approvals
      FOR ALL
      USING (organization_id = smarttalk.get_agent_org_id());
  END IF;
END $$;

COMMENT ON TABLE  public.cm_post_approvals              IS 'Sprint 25 · magic-link approval requests (portal público).';
COMMENT ON COLUMN public.cm_post_approvals.token_hash   IS 'SHA-256(token) — el token plain nunca se guarda.';
COMMENT ON COLUMN public.cm_post_approvals.status       IS 'pending → approved | rejected | expired (batch cleanup).';
COMMENT ON COLUMN public.cm_post_approvals.responded_by_email IS 'Email declarado por el cliente al responder (self-reported).';
