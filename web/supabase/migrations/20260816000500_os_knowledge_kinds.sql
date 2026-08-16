-- Migration: os_knowledge_kinds
-- Sprint 5 · Item 2 — Custom node kinds per org

CREATE TABLE IF NOT EXISTS os_knowledge_kinds (
  id              text        NOT NULL,
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           text        NOT NULL,
  color           text        NOT NULL DEFAULT '#5ec9f8',
  icon            text,
  description     text        NOT NULL DEFAULT '',
  system          boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

ALTER TABLE os_knowledge_kinds ENABLE ROW LEVEL SECURITY;

CREATE POLICY os_kk_read  ON os_knowledge_kinds
  FOR SELECT USING (org_id = os_current_org());

CREATE POLICY os_kk_write ON os_knowledge_kinds
  FOR ALL USING (org_id = os_current_org())
  WITH CHECK (org_id = os_current_org());

-- Backfill system kinds for every existing org
INSERT INTO os_knowledge_kinds (id, org_id, label, color, icon, system)
SELECT k.id, o.id, k.label, k.color, k.icon, true
FROM organizations o
CROSS JOIN (VALUES
  ('contact',  'Contact',  '#5ec9f8', 'user'),
  ('topic',    'Topic',    '#a78bfa', 'message-circle'),
  ('decision', 'Decision', '#3df08c', 'check-circle'),
  ('event',    'Event',    '#f59e0b', 'calendar'),
  ('tag',      'Tag',      '#f472b6', 'tag'),
  ('custom',   'Custom',   '#888888', 'circle')
) AS k(id, label, color, icon)
ON CONFLICT DO NOTHING;

-- Relax the CHECK constraint — validation moves to app layer via os_knowledge_kinds lookup
ALTER TABLE os_knowledge_nodes DROP CONSTRAINT IF EXISTS os_knowledge_nodes_kind_check;
