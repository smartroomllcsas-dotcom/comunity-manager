-- =============================================================================
-- 043 — tabla ai_agents (faltante).
--
-- El código (api/ai-agents, chatbot/engine.ts, chatbot/ai.ts) usa la tabla
-- smarttalk.ai_agents y knowledge_sources.ai_agent_id, pero ninguna migración
-- la creó (las migraciones antiguas dejaron `ai_config`/`ai_config_id`).
-- Esto crea la tabla con las columnas que el código espera. Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS smarttalk.ai_agents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL,
  name                 TEXT NOT NULL,
  description          TEXT,
  emoji                TEXT DEFAULT '🤖',
  agent_type           TEXT DEFAULT 'custom',
  system_prompt        TEXT NOT NULL DEFAULT '',
  actions              JSONB NOT NULL DEFAULT '[]',
  escalation_keywords  TEXT[] DEFAULT '{}',
  max_turns            INT DEFAULT 20,
  max_tokens           INT DEFAULT 1024,
  is_active            BOOLEAN NOT NULL DEFAULT false,
  is_default           BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_org_active
  ON smarttalk.ai_agents (organization_id, is_active);

-- knowledge_sources.ai_agent_id — el código lo consulta (ai.ts:112). La tabla
-- vieja solo tenía ai_config_id.
ALTER TABLE smarttalk.knowledge_sources
  ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES smarttalk.ai_agents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_agent
  ON smarttalk.knowledge_sources (ai_agent_id);

ALTER TABLE smarttalk.ai_agents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'smarttalk' AND tablename = 'ai_agents'
      AND policyname = 'ai_agents_all'
  ) THEN
    CREATE POLICY ai_agents_all ON smarttalk.ai_agents
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION smarttalk.ai_agents_touch()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_agents_touch_trg ON smarttalk.ai_agents;
CREATE TRIGGER ai_agents_touch_trg
  BEFORE UPDATE ON smarttalk.ai_agents
  FOR EACH ROW EXECUTE FUNCTION smarttalk.ai_agents_touch();
