-- 020_waha_channel.sql
-- Add WAHA (self-hosted WhatsApp HTTP API) as a channel provider.
-- Credentials live in channels.config (JSONB):
--   { sessionName, brandId, hmacSecretHint }
-- The shared WAHA_API_KEY is server-side only (env var, not per-channel).

SET search_path TO smarttalk, public, auth, extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'channel_type' AND e.enumlabel = 'waha'
  ) THEN
    ALTER TYPE channel_type ADD VALUE 'waha';
  END IF;
END$$;

-- Per-session runtime state. One row per WAHA session (~ one row per WhatsApp number).
CREATE TABLE IF NOT EXISTS smarttalk.waha_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL UNIQUE REFERENCES smarttalk.channels(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'STARTING',
  phone_number TEXT,
  push_name TEXT,
  last_qr_at TIMESTAMPTZ,
  last_status_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waha_sessions_status
  ON smarttalk.waha_sessions(status)
  WHERE status IN ('STARTING', 'SCAN_QR_CODE', 'FAILED', 'STOPPED');

CREATE INDEX IF NOT EXISTS idx_waha_sessions_channel
  ON smarttalk.waha_sessions(channel_id);

ALTER TABLE smarttalk.waha_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='smarttalk' AND tablename='waha_sessions' AND policyname='waha_sessions_service_only'
  ) THEN
    CREATE POLICY "waha_sessions_service_only"
      ON smarttalk.waha_sessions FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END$$;

COMMENT ON TABLE smarttalk.waha_sessions IS
  'Runtime state of self-hosted WAHA WhatsApp sessions. session_name = brand_<brand_id_no_dashes>. Beta channel (Sprint 27).';

COMMENT ON COLUMN smarttalk.waha_sessions.status IS
  'Mirrors WAHA session status: STARTING | SCAN_QR_CODE | WORKING | FAILED | STOPPED';
