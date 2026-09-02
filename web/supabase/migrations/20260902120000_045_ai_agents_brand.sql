-- 045: Agente de IA POR EMPRESA (modelo de agencia).
--
-- Agrega brand_id a smarttalk.ai_agents para que cada empresa (marca) tenga su
-- propio agente independiente. brand_id apunta conceptualmente a
-- public.cm_clients.id (la "empresa/marca" en el modelo del CM), igual que
-- conversations.brand_id.
--
-- No se agrega FOREIGN KEY cross-schema a propósito: PostgREST no la tendría en
-- su schema cache y rompería queries (mismo problema que ai_agents<->
-- knowledge_sources). La integridad se maneja en la app.
--
-- Semántica:
--   brand_id = <uuid marca>  -> agente propio de esa empresa
--   brand_id = NULL          -> agente general (sin empresa)
-- El "predeterminado" (is_default) es por empresa: uno por marca, más uno
-- opcional entre los agentes sin marca.

ALTER TABLE smarttalk.ai_agents
  ADD COLUMN IF NOT EXISTS brand_id UUID;

-- Índice para la selección del agente por organización + marca en el motor.
CREATE INDEX IF NOT EXISTS ai_agents_org_brand_active_idx
  ON smarttalk.ai_agents (organization_id, brand_id, is_active);
