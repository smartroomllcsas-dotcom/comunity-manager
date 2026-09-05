-- 046: notas internas escritas por el sistema (agente de IA, webhook de Cal.com).
--
-- internal_notes.agent_id era NOT NULL, así que toda nota insertada con
-- agent_id = NULL (el add_comment del agente de IA) fallaba en silencio.
-- El código ahora atribuye esas notas a un asesor real como respaldo; esta
-- migración permite además guardar notas sin autor humano.
--
-- PENDIENTE DE APLICAR en producción (la base es self-hosted; no se aplicó
-- automáticamente el 2026-09-04). El código funciona con o sin ella.
ALTER TABLE smarttalk.internal_notes
  ALTER COLUMN agent_id DROP NOT NULL;
