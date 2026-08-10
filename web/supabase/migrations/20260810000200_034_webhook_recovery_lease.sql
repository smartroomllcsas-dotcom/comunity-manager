-- Sprint · Lease para el worker de recuperación de webhooks de billing
-- ===========================================================================
-- ESTADO: APLICADA en Supabase por el propietario (Success. No rows returned).
--
-- Por qué
-- -------
-- `smarttalk.billing_webhook_events` ya tiene `locked_at` (migración 010) pero
-- NO tiene `locked_by`. Sin saber qué worker posee el lease no se puede
-- distinguir "lo tengo yo" de "lo tiene otro", ni diagnosticar un lease colgado.
--
-- El worker `src/lib/billing/webhook-recovery.ts` reclama cada evento con un
-- UPDATE condicional sobre (`locked_at` nulo OR lease vencido). Ese UPDATE es
-- atómico en PostgreSQL, así que dos crons simultáneos no pueden procesar el
-- mismo evento.
--
-- Seguridad del cambio
-- --------------------
-- Es puramente aditivo: una columna nullable y un índice parcial. No modifica
-- datos existentes, no cambia constraints y no toca ninguna función.
--
-- Mientras NO esté aplicada, el worker se detiene con `schema_not_ready` en vez
-- de procesar sin lease: ver `WebhookRecoverySchemaError`. El cron responde 503.
--
-- Rollback
-- --------
--   DROP INDEX IF EXISTS smarttalk.idx_billing_webhook_events_recovery;
--   ALTER TABLE smarttalk.billing_webhook_events DROP COLUMN IF EXISTS locked_by;
-- ===========================================================================

SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.billing_webhook_events
  ADD COLUMN IF NOT EXISTS locked_by TEXT;

COMMENT ON COLUMN smarttalk.billing_webhook_events.locked_by IS
  'Identificador del worker que posee el lease. Se limpia junto con locked_at al soltar el evento.';

-- Índice de la consulta del worker: failed + firma válida + intentos por debajo
-- del máximo + turno vencido.
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_recovery
  ON smarttalk.billing_webhook_events(next_attempt_at, attempt_count)
  WHERE status = 'failed' AND signature_valid = TRUE;
