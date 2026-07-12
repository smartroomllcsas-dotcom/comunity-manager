-- Sprint 5: queue persistente para eventos de webhook Meta.
-- El webhook responde 200 tras verificar HMAC + persistir. Un worker
-- (after() sincrono o cron /api/inbox/process-webhook-events) procesa el resto.

SET search_path TO smarttalk, public, auth, extensions;

CREATE TABLE IF NOT EXISTS smarttalk.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,                 -- facebook | messenger | instagram | whatsapp
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processed | failed
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Índice para el worker: encuentra pending o failed retryables por FIFO.
CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON smarttalk.webhook_events(status, created_at)
  WHERE status IN ('pending', 'failed');

-- Índice para observabilidad reciente.
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
  ON smarttalk.webhook_events(created_at DESC);

ALTER TABLE smarttalk.webhook_events ENABLE ROW LEVEL SECURITY;

-- Solo service role accede. authenticated/anon rechazados.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='smarttalk' AND tablename='webhook_events' AND policyname='webhook_events_service_only'
  ) THEN
    CREATE POLICY "webhook_events_service_only"
      ON smarttalk.webhook_events FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

COMMENT ON TABLE smarttalk.webhook_events IS
  'Cola persistente de eventos de webhook Meta. Sobrevive a reinicio del worker.';
