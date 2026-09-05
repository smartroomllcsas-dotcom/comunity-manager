-- =============================================================================
-- 042 — catálogo/brochure del agente por empresa.
-- El administrador sube un PDF/imagen por marca y decide cuándo lo envía el
-- agente: nunca | tras el saludo (automático) | solo si el cliente lo pide.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.cm_lead_agent_settings
  ADD COLUMN IF NOT EXISTS brochure_url      TEXT,
  ADD COLUMN IF NOT EXISTS brochure_filename TEXT,
  ADD COLUMN IF NOT EXISTS brochure_mode     TEXT NOT NULL DEFAULT 'off';
  -- brochure_mode: 'off' | 'after_greeting' | 'on_request'
