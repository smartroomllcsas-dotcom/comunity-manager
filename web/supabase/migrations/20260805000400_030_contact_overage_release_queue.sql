-- Claim/release support for the durable over-quota inbound message queue.
-- The function is service-role-only and uses SKIP LOCKED so overlapping cron
-- invocations cannot replay the same event concurrently.
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.contact_overage_events
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by TEXT;

ALTER TABLE smarttalk.contact_overage_events
  DROP CONSTRAINT IF EXISTS contact_overage_events_status_check;

ALTER TABLE smarttalk.contact_overage_events
  ADD CONSTRAINT contact_overage_events_status_check
  CHECK (status IN ('pending', 'processing', 'released', 'discarded'));

CREATE INDEX IF NOT EXISTS idx_contact_overage_events_release_queue
  ON smarttalk.contact_overage_events(status, claimed_at, created_at);

CREATE OR REPLACE FUNCTION smarttalk.claim_contact_overage_events(
  p_worker_id TEXT,
  p_limit INTEGER DEFAULT 50,
  p_stale_after_seconds INTEGER DEFAULT 900
)
RETURNS SETOF smarttalk.contact_overage_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, pg_temp
AS $$
BEGIN
  IF COALESCE(length(trim(p_worker_id)), 0) = 0 THEN
    RAISE EXCEPTION 'worker_id is required';
  END IF;

  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'limit must be between 1 and 500';
  END IF;

  IF p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
    RAISE EXCEPTION 'stale_after_seconds must be between 60 and 86400';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT event.id
    FROM smarttalk.contact_overage_events AS event
    WHERE event.status = 'pending'
       OR (
         event.status = 'processing'
         AND (
           event.claimed_at IS NULL
           OR event.claimed_at < NOW() - make_interval(secs => p_stale_after_seconds)
         )
       )
    ORDER BY event.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE smarttalk.contact_overage_events AS event
  SET status = 'processing',
      claimed_at = NOW(),
      claimed_by = left(trim(p_worker_id), 100),
      attempts = event.attempts + 1,
      last_error = NULL,
      updated_at = NOW()
  FROM candidates
  WHERE event.id = candidates.id
  RETURNING event.*;
END;
$$;

REVOKE ALL ON FUNCTION smarttalk.claim_contact_overage_events(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION smarttalk.claim_contact_overage_events(TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION smarttalk.claim_contact_overage_events(TEXT, INTEGER, INTEGER) IS
  'Claims pending overage events for one worker. Stale processing leases can be reclaimed safely.';
