-- ============================================================================
-- FounderOS × Agentic-OS Sprint 1
-- 7 tablas prefijo os_*, multi-tenant via org_id
-- Cero cambios en tablas cm_* existentes
-- ============================================================================

CREATE TABLE os_agents (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id   text NOT NULL,
  name            text NOT NULL,
  role            text NOT NULL DEFAULT '',
  status          text NOT NULL CHECK (status IN ('active','idle','training','planned')),
  tier            text NOT NULL CHECK (tier IN ('lead','specialist','worker')),
  description     text NOT NULL DEFAULT '',
  model           text NOT NULL DEFAULT '',
  tools           jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_id       text,
  instance        text NOT NULL DEFAULT 'builtin',
  constitution    jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_score     numeric NOT NULL DEFAULT 0.5,
  trust_ledger    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_agents_org_dep_idx ON os_agents (org_id, department_id);
CREATE INDEX os_agents_org_tier_idx ON os_agents (org_id, tier);

CREATE TABLE os_goals (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  spec            jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_agent_id  text REFERENCES os_agents(id) ON DELETE SET NULL,
  cadence         text NOT NULL,
  last_checked_at timestamptz,
  last_status     text CHECK (last_status IN ('ok','breach','unknown')),
  last_evidence   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_goals_org_idx ON os_goals (org_id);

CREATE TABLE os_skills (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text NOT NULL,
  description     text NOT NULL DEFAULT '',
  owner_agent_id  text REFERENCES os_agents(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'planned' CHECK (status IN ('live','learning','planned')),
  tools           jsonb NOT NULL DEFAULT '[]'::jsonb,
  markdown        text NOT NULL DEFAULT '',
  schedule        text,
  ord             int NOT NULL DEFAULT 0
);
CREATE INDEX os_skills_org_idx ON os_skills (org_id);

CREATE TABLE os_workflows (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  subtitle        text NOT NULL DEFAULT '',
  revenue_usd     int NOT NULL DEFAULT 0,
  ord             int NOT NULL DEFAULT 0,
  steps           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX os_workflows_org_idx ON os_workflows (org_id);

CREATE TABLE os_agent_runs (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id        text NOT NULL REFERENCES os_agents(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz,
  ok              boolean,
  summary         text NOT NULL DEFAULT '',
  input           jsonb,
  output          jsonb,
  tokens_in       int,
  tokens_out      int,
  cost_usd        numeric
);
CREATE INDEX os_agent_runs_org_started_idx ON os_agent_runs (org_id, started_at DESC);
CREATE INDEX os_agent_runs_agent_idx ON os_agent_runs (agent_id, started_at DESC);

CREATE TABLE os_connectors (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  provider        text NOT NULL,
  status          text NOT NULL CHECK (status IN ('not_configured','configured','live','error')),
  last_check_at   timestamptz,
  last_error      text,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref      text,
  UNIQUE (org_id, id)
);
CREATE INDEX os_connectors_org_status_idx ON os_connectors (org_id, status);

CREATE TABLE os_activity (
  id              bigserial PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  actor_id        text,
  at              timestamptz NOT NULL DEFAULT now(),
  summary         text NOT NULL DEFAULT '',
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok              boolean
);
CREATE INDEX os_activity_org_at_idx ON os_activity (org_id, at DESC);

-- RLS helper
CREATE OR REPLACE FUNCTION os_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'org_id','')::uuid
$$;

-- Enable RLS on all 7 tables
ALTER TABLE os_agents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_goals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_skills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_workflows   ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_agent_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_connectors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_activity    ENABLE ROW LEVEL SECURITY;

-- RLS policies (loop)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['os_agents','os_goals','os_skills','os_workflows',
                           'os_agent_runs','os_connectors','os_activity']
  LOOP
    EXECUTE format($f$
      CREATE POLICY %I_tenant_read  ON %I FOR SELECT USING (org_id = os_current_org());
      CREATE POLICY %I_tenant_write ON %I FOR ALL    USING (org_id = os_current_org())
                                                     WITH CHECK (org_id = os_current_org());
    $f$, t, t, t, t);
  END LOOP;
END $$;

-- View para activity feed enriched (evita N+1)
CREATE OR REPLACE VIEW os_activity_enriched AS
SELECT
  a.*,
  ag.name AS actor_name,
  ag.tier AS actor_tier
FROM os_activity a
LEFT JOIN os_agents ag ON ag.id = a.actor_id AND ag.org_id = a.org_id;

ALTER VIEW os_activity_enriched SET (security_invoker = true);

-- DOWN (Sprint 1 rollback):
-- DROP VIEW IF EXISTS os_activity_enriched;
-- DROP TABLE IF EXISTS os_activity      CASCADE;
-- DROP TABLE IF EXISTS os_connectors    CASCADE;
-- DROP TABLE IF EXISTS os_agent_runs    CASCADE;
-- DROP TABLE IF EXISTS os_workflows     CASCADE;
-- DROP TABLE IF EXISTS os_skills        CASCADE;
-- DROP TABLE IF EXISTS os_goals         CASCADE;
-- DROP TABLE IF EXISTS os_agents        CASCADE;
-- DROP FUNCTION IF EXISTS os_current_org() CASCADE;
