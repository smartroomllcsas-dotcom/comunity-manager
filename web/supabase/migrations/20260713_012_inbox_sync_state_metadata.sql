-- Sprint 9: metadata JSONB en inbox_sync_state.
-- Permite guardar el cursor de paginación por (org, resource) para backfills incrementales.

SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.inbox_sync_state
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN smarttalk.inbox_sync_state.metadata IS
  'Estado libre por resource. Ej.: {"conversationsCursor": "https://…"} para backfill Instagram incremental.';
