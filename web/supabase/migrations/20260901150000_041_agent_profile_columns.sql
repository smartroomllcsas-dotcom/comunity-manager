-- =============================================================================
-- 041 — perfil seleccionable del agente por empresa: rol, tono y objetivo.
-- Complementa cm_lead_agent_settings (migración 040). Idempotente.
-- Valores válidos definidos en web/src/lib/whatsapp/cloud/agent-presets.ts.
-- =============================================================================

ALTER TABLE public.cm_lead_agent_settings
  ADD COLUMN IF NOT EXISTS agent_role TEXT,
  ADD COLUMN IF NOT EXISTS agent_tone TEXT,
  ADD COLUMN IF NOT EXISTS agent_goal TEXT DEFAULT 'calificar_y_agendar';
