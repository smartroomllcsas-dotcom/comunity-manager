-- Add a single brand administrator role without widening agency access.
-- Brand administrators and brand advisors remain scoped to explicit brands.
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.agents
  DROP CONSTRAINT IF EXISTS agents_member_type_check;
ALTER TABLE smarttalk.agents
  ADD CONSTRAINT agents_member_type_check
  CHECK (member_type IN ('agency_user', 'brand_admin', 'brand_advisor'));

ALTER TABLE smarttalk.invitations
  DROP CONSTRAINT IF EXISTS invitations_member_type_check;
ALTER TABLE smarttalk.invitations
  ADD CONSTRAINT invitations_member_type_check
  CHECK (member_type IN ('agency_user', 'brand_admin', 'brand_advisor'));

-- The existing assignment tables are intentionally reused: the agent/invitation
-- is the source of truth for its member_type. This keeps existing advisors valid.
CREATE OR REPLACE FUNCTION smarttalk.validate_brand_advisor_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_agent_org UUID;
  v_member_type TEXT;
  v_brand_org UUID;
BEGIN
  SELECT organization_id, member_type
  INTO v_agent_org, v_member_type
  FROM smarttalk.agents
  WHERE id = NEW.agent_id;

  SELECT smarttalk_organization_id
  INTO v_brand_org
  FROM public.cm_clients
  WHERE id = NEW.brand_id;

  IF v_member_type NOT IN ('brand_admin', 'brand_advisor') THEN
    RAISE EXCEPTION 'Only brand administrators or advisors can receive brand assignments';
  END IF;
  IF v_agent_org IS NULL OR v_agent_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Agent does not belong to assignment organization';
  END IF;
  IF v_brand_org IS NULL OR v_brand_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Brand does not belong to assignment organization';
  END IF;
  IF v_member_type = 'brand_admin' AND EXISTS (
    SELECT 1
    FROM smarttalk.brand_advisor_assignments AS assignment
    INNER JOIN smarttalk.agents AS assigned_agent ON assigned_agent.id = assignment.agent_id
    WHERE assignment.brand_id = NEW.brand_id
      AND assignment.agent_id <> NEW.agent_id
      AND assigned_agent.member_type = 'brand_admin'
  ) THEN
    RAISE EXCEPTION 'This brand already has an administrator';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = smarttalk, public;

CREATE OR REPLACE FUNCTION smarttalk.validate_invitation_brand_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation_org UUID;
  v_member_type TEXT;
  v_brand_org UUID;
BEGIN
  SELECT organization_id, member_type
  INTO v_invitation_org, v_member_type
  FROM smarttalk.invitations
  WHERE id = NEW.invitation_id;

  SELECT smarttalk_organization_id
  INTO v_brand_org
  FROM public.cm_clients
  WHERE id = NEW.brand_id;

  IF v_member_type NOT IN ('brand_admin', 'brand_advisor') THEN
    RAISE EXCEPTION 'Only brand administrator or advisor invitations can receive brands';
  END IF;
  IF v_invitation_org IS NULL OR v_invitation_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Invitation does not belong to assignment organization';
  END IF;
  IF v_brand_org IS NULL OR v_brand_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Brand does not belong to assignment organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = smarttalk, public;

-- A brand administrator cannot retain multiple legacy advisor assignments.
CREATE OR REPLACE FUNCTION smarttalk.validate_brand_member_type_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_assignment_count INTEGER;
BEGIN
  IF NEW.member_type <> 'brand_admin' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO v_assignment_count
  FROM smarttalk.brand_advisor_assignments
  WHERE agent_id = NEW.id;

  IF v_assignment_count > 1 THEN
    RAISE EXCEPTION 'A brand administrator can be assigned to only one brand';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = smarttalk, public;

DROP TRIGGER IF EXISTS validate_brand_member_type_transition ON smarttalk.agents;
CREATE TRIGGER validate_brand_member_type_transition
  BEFORE UPDATE OF member_type ON smarttalk.agents
  FOR EACH ROW EXECUTE FUNCTION smarttalk.validate_brand_member_type_transition();

-- Extend all existing brand-scoped policies to the new brand administrator.
CREATE OR REPLACE FUNCTION smarttalk.current_agent_can_access_brand(target_brand_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = smarttalk, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM smarttalk.agents AS agent
    WHERE agent.id = auth.uid()
      AND (
        agent.member_type = 'agency_user'
        OR EXISTS (
          SELECT 1
          FROM smarttalk.brand_advisor_assignments AS assignment
          WHERE assignment.agent_id = agent.id
            AND assignment.organization_id = agent.organization_id
            AND assignment.brand_id = target_brand_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION smarttalk.current_agent_can_read_agent(target_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = smarttalk, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM smarttalk.agents AS current_agent
    INNER JOIN smarttalk.agents AS target_agent
      ON target_agent.id = target_agent_id
     AND target_agent.organization_id = current_agent.organization_id
    WHERE current_agent.id = auth.uid()
      AND (
        current_agent.member_type = 'agency_user'
        OR target_agent.id = current_agent.id
        OR (
          current_agent.member_type = 'brand_admin'
          AND target_agent.member_type = 'brand_advisor'
          AND EXISTS (
            SELECT 1
            FROM smarttalk.brand_advisor_assignments AS own_assignment
            INNER JOIN smarttalk.brand_advisor_assignments AS advisor_assignment
              ON advisor_assignment.brand_id = own_assignment.brand_id
            WHERE own_assignment.agent_id = current_agent.id
              AND advisor_assignment.agent_id = target_agent.id
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "agents_own_org" ON smarttalk.agents;
CREATE POLICY "agents_own_org"
  ON smarttalk.agents FOR SELECT
  USING (
    organization_id = smarttalk.get_agent_org_id()
    AND smarttalk.current_agent_can_read_agent(id)
  );

COMMENT ON COLUMN smarttalk.agents.member_type IS
  'agency_user sees the agency; brand_admin is one administrator for one brand; brand_advisor sees only assigned brands.';
