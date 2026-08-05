-- Harden advisor isolation for direct Supabase queries.
-- Contacts, conversations and channels are brand-scoped by migration 013.
-- This migration applies the same rule to messages and internal notes, which
-- historically used organization-only policies.
SET search_path TO smarttalk, public, auth, extensions;

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
        agent.is_super_admin = TRUE
        OR agent.member_type = 'agency_user'
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

REVOKE ALL ON FUNCTION smarttalk.current_agent_can_access_brand(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION smarttalk.current_agent_can_access_brand(UUID)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "messages_own_org" ON smarttalk.messages;
DROP POLICY IF EXISTS "messages_own_org_brand" ON smarttalk.messages;
CREATE POLICY "messages_own_org_brand"
  ON smarttalk.messages
  FOR ALL
  USING (
    conversation_id IN (
      SELECT conversation.id
      FROM smarttalk.conversations AS conversation
      WHERE conversation.organization_id = smarttalk.get_agent_org_id()
        AND smarttalk.current_agent_can_access_brand(conversation.brand_id)
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT conversation.id
      FROM smarttalk.conversations AS conversation
      WHERE conversation.organization_id = smarttalk.get_agent_org_id()
        AND smarttalk.current_agent_can_access_brand(conversation.brand_id)
    )
  );

DROP POLICY IF EXISTS "internal_notes_own_org" ON smarttalk.internal_notes;
DROP POLICY IF EXISTS "internal_notes_own_org_brand" ON smarttalk.internal_notes;
CREATE POLICY "internal_notes_own_org_brand"
  ON smarttalk.internal_notes
  FOR ALL
  USING (
    conversation_id IN (
      SELECT conversation.id
      FROM smarttalk.conversations AS conversation
      WHERE conversation.organization_id = smarttalk.get_agent_org_id()
        AND smarttalk.current_agent_can_access_brand(conversation.brand_id)
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT conversation.id
      FROM smarttalk.conversations AS conversation
      WHERE conversation.organization_id = smarttalk.get_agent_org_id()
        AND smarttalk.current_agent_can_access_brand(conversation.brand_id)
    )
  );

COMMENT ON FUNCTION smarttalk.current_agent_can_access_brand(UUID) IS
  'Allows super administrators and agency users globally; brand administrators and advisors only for explicitly assigned brands.';
