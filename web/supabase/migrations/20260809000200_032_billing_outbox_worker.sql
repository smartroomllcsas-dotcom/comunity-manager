-- Atomic claim/complete/retry operations for the billing outbox worker.

SET search_path TO smarttalk, public, auth, extensions;

CREATE OR REPLACE FUNCTION smarttalk.claim_billing_outbox_jobs(
  p_limit INT DEFAULT 25,
  p_worker_id TEXT DEFAULT 'billing-worker',
  p_lease_seconds INT DEFAULT 120
)
RETURNS SETOF smarttalk.billing_outbox_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM smarttalk.billing_outbox_jobs AS job
    WHERE (
      job.status IN ('pending', 'retry')
      AND job.available_at <= NOW()
    ) OR (
      job.status = 'processing'
      AND job.locked_at <= NOW() - make_interval(secs => GREATEST(1, p_lease_seconds))
    )
    ORDER BY job.available_at, job.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  UPDATE smarttalk.billing_outbox_jobs AS job
  SET status = 'processing',
      attempt_count = job.attempt_count + 1,
      locked_at = NOW(),
      locked_by = p_worker_id,
      last_error_code = NULL,
      last_error_message = NULL
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*;
END;
$function$;

CREATE OR REPLACE FUNCTION smarttalk.complete_billing_outbox_job(
  p_job_id UUID,
  p_worker_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $function$
BEGIN
  UPDATE smarttalk.billing_outbox_jobs
  SET status = 'completed',
      completed_at = NOW(),
      locked_at = NULL,
      locked_by = NULL
  WHERE id = p_job_id
    AND status = 'processing'
    AND locked_by = p_worker_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION smarttalk.retry_billing_outbox_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_error_code TEXT,
  p_error_message TEXT,
  p_max_attempts INT DEFAULT 5
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, auth, extensions
AS $function$
DECLARE
  next_status TEXT;
BEGIN
  UPDATE smarttalk.billing_outbox_jobs
  SET status = CASE
        WHEN attempt_count >= GREATEST(1, p_max_attempts) THEN 'dead_letter'
        ELSE 'retry'
      END,
      available_at = NOW() + make_interval(
        secs => LEAST(3600, (POWER(2, LEAST(attempt_count, 10)) * 30)::INT)
      ),
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = LEFT(p_error_code, 120),
      last_error_message = LEFT(p_error_message, 2000)
  WHERE id = p_job_id
    AND status = 'processing'
    AND locked_by = p_worker_id
  RETURNING status INTO next_status;

  RETURN COALESCE(next_status, 'not_owned');
END;
$function$;

REVOKE ALL ON FUNCTION smarttalk.claim_billing_outbox_jobs(INT, TEXT, INT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION smarttalk.complete_billing_outbox_job(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION smarttalk.retry_billing_outbox_job(UUID, TEXT, TEXT, TEXT, INT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION smarttalk.claim_billing_outbox_jobs(INT, TEXT, INT)
  TO service_role;
GRANT EXECUTE ON FUNCTION smarttalk.complete_billing_outbox_job(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION smarttalk.retry_billing_outbox_job(UUID, TEXT, TEXT, TEXT, INT)
  TO service_role;
