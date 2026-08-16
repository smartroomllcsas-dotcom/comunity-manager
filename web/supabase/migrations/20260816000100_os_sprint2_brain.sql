-- ============================================================================
-- Community OS · Sprint 2 · Brain knowledge graph
-- Tables prefixed os_knowledge_*, multi-tenant via org_id, RLS enforced
-- Zero changes to Sprint 1 tables (os_agents, os_goals, etc.)
-- ============================================================================

CREATE TABLE os_knowledge_nodes (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('contact','topic','decision','event','tag','custom')),
  label           text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  props           jsonb NOT NULL DEFAULT '{}'::jsonb,
  source          text,                                          -- 'cm_contacts' | 'cm_conversations' | 'manual' | ...
  source_id       text,                                          -- FK to source table row (nullable)
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  weight          numeric NOT NULL DEFAULT 1.0,                  -- importance (0..N)
  vector          jsonb                                          -- embedding placeholder (Sprint 3 real)
);
CREATE INDEX os_knowledge_nodes_org_kind_idx ON os_knowledge_nodes (org_id, kind);
CREATE INDEX os_knowledge_nodes_org_source_idx ON os_knowledge_nodes (org_id, source, source_id);
CREATE INDEX os_knowledge_nodes_org_weight_idx ON os_knowledge_nodes (org_id, weight DESC);

CREATE TABLE os_knowledge_edges (
  id              bigserial PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_node_id    text NOT NULL REFERENCES os_knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id      text NOT NULL REFERENCES os_knowledge_nodes(id) ON DELETE CASCADE,
  relation        text NOT NULL,                                 -- 'mentions' | 'assigned_to' | 'about' | 'follows' | ...
  weight          numeric NOT NULL DEFAULT 1.0,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, from_node_id, to_node_id, relation)
);
CREATE INDEX os_knowledge_edges_org_from_idx ON os_knowledge_edges (org_id, from_node_id);
CREATE INDEX os_knowledge_edges_org_to_idx ON os_knowledge_edges (org_id, to_node_id);
CREATE INDEX os_knowledge_edges_org_relation_idx ON os_knowledge_edges (org_id, relation);

ALTER TABLE os_knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_knowledge_edges ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['os_knowledge_nodes','os_knowledge_edges']
  LOOP
    EXECUTE format($f$
      CREATE POLICY %I_tenant_read  ON %I FOR SELECT USING (org_id = os_current_org());
      CREATE POLICY %I_tenant_write ON %I FOR ALL    USING (org_id = os_current_org())
                                                     WITH CHECK (org_id = os_current_org());
    $f$, t, t, t, t);
  END LOOP;
END $$;

-- Analytics view: node degree + edge count
CREATE OR REPLACE VIEW os_knowledge_nodes_enriched AS
SELECT
  n.*,
  COALESCE(out.deg_out, 0) AS deg_out,
  COALESCE(inn.deg_in, 0) AS deg_in
FROM os_knowledge_nodes n
LEFT JOIN (SELECT org_id, from_node_id, count(*) AS deg_out FROM os_knowledge_edges GROUP BY org_id, from_node_id) out
  ON out.org_id = n.org_id AND out.from_node_id = n.id
LEFT JOIN (SELECT org_id, to_node_id, count(*) AS deg_in FROM os_knowledge_edges GROUP BY org_id, to_node_id) inn
  ON inn.org_id = n.org_id AND inn.to_node_id = n.id;

ALTER VIEW os_knowledge_nodes_enriched SET (security_invoker = true);

-- DOWN (Sprint 2 brain rollback):
-- DROP VIEW IF EXISTS os_knowledge_nodes_enriched;
-- DROP TABLE IF EXISTS os_knowledge_edges CASCADE;
-- DROP TABLE IF EXISTS os_knowledge_nodes CASCADE;
