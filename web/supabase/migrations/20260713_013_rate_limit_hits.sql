-- Sprint 11: rate limit persistente en DB (serverless-safe).
-- Reemplaza el Map in-memory de lib/rate-limit.ts.

SET search_path TO smarttalk, public, auth, extensions;

CREATE TABLE IF NOT EXISTS smarttalk.rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time
  ON smarttalk.rate_limit_hits(key, hit_at DESC);

-- Índice para la limpieza periódica (drop de hits viejos).
CREATE INDEX IF NOT EXISTS idx_rate_limit_hit_at
  ON smarttalk.rate_limit_hits(hit_at);

ALTER TABLE smarttalk.rate_limit_hits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='smarttalk' AND tablename='rate_limit_hits' AND policyname='rate_limit_hits_service_only'
  ) THEN
    CREATE POLICY "rate_limit_hits_service_only"
      ON smarttalk.rate_limit_hits FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

COMMENT ON TABLE smarttalk.rate_limit_hits IS
  'Sliding-window rate limit hits. Consistente entre workers Vercel (serverless-safe).';
