-- =============================================================================
-- 044 — intervalo de respuesta del agente por empresa.
-- Segundos que espera el agente IA antes de responder a un mensaje entrante
-- (0 = inmediato). Da una sensación más humana y evita respuestas instantáneas.
-- Tope efectivo 300s (5 min) aplicado en código por límites de serverless.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.cm_lead_agent_settings
  ADD COLUMN IF NOT EXISTS response_delay_seconds INT NOT NULL DEFAULT 0
    CHECK (response_delay_seconds BETWEEN 0 AND 300);
