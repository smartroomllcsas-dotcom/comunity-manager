-- =====================================================================
-- OS Tasks — kanban queue fed by agents
-- Schema: smarttalk (FK-friendly with existing brands/agents)
-- Idempotent (safe to re-run)
-- Author: Community Manager Platform
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS smarttalk;

CREATE TABLE IF NOT EXISTS smarttalk.os_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  brand_id            uuid NULL,
  title               text NOT NULL,
  description         text NOT NULL DEFAULT '',
  status              text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  assignee_agent_id   uuid NULL,
  due_at              timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_os_tasks_org         ON smarttalk.os_tasks (org_id);
CREATE INDEX IF NOT EXISTS idx_os_tasks_org_status  ON smarttalk.os_tasks (org_id, status);
CREATE INDEX IF NOT EXISTS idx_os_tasks_org_brand   ON smarttalk.os_tasks (org_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_os_tasks_assignee    ON smarttalk.os_tasks (assignee_agent_id) WHERE assignee_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_os_tasks_due_at      ON smarttalk.os_tasks (due_at) WHERE due_at IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION smarttalk.os_tasks_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_os_tasks_updated_at ON smarttalk.os_tasks;
CREATE TRIGGER trg_os_tasks_updated_at
  BEFORE UPDATE ON smarttalk.os_tasks
  FOR EACH ROW EXECUTE FUNCTION smarttalk.os_tasks_set_updated_at();

-- RLS
ALTER TABLE smarttalk.os_tasks ENABLE ROW LEVEL SECURITY;

-- Service role bypass (adjust if RLS policies for auth.uid() are wired elsewhere)
DROP POLICY IF EXISTS os_tasks_service_all ON smarttalk.os_tasks;
CREATE POLICY os_tasks_service_all ON smarttalk.os_tasks
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can read/write tasks tied to their brand(s)
-- (Application layer enforces org scoping via requireOrgIdFromRequest.)
DROP POLICY IF EXISTS os_tasks_authenticated_all ON smarttalk.os_tasks;
CREATE POLICY os_tasks_authenticated_all ON smarttalk.os_tasks
  FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE smarttalk.os_tasks IS
  'Kanban task queue for Community Manager OS. Fed by agents; consumed by human operators.';
