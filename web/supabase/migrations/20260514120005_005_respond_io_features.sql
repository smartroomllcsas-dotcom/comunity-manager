SET search_path TO smarttalk, public, auth, extensions;

-- =============================================
-- 1. TEAMS (group agents into teams)
-- =============================================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent-team membership (many-to-many)
CREATE TABLE agent_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, team_id)
);

-- =============================================
-- 2. CONTACT LIFECYCLE
-- =============================================
CREATE TABLE lifecycle_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'primary', -- 'primary' or 'lost'
  color TEXT NOT NULL DEFAULT '#3b82f6',
  position INT NOT NULL DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add lifecycle_stage_id to contacts
ALTER TABLE contacts ADD COLUMN lifecycle_stage_id UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL;

-- Contact lifecycle history
CREATE TABLE lifecycle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES lifecycle_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES lifecycle_stages(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  changed_by_type TEXT NOT NULL DEFAULT 'agent', -- 'agent', 'workflow', 'ai_agent'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. TAGS MANAGEMENT
-- =============================================
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- =============================================
-- 4. CUSTOM CONTACT FIELDS DEFINITION
-- =============================================
CREATE TYPE custom_field_type AS ENUM ('text', 'number', 'date', 'time', 'list', 'checkbox', 'url');

CREATE TABLE contact_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_key TEXT NOT NULL, -- unique key for API access
  type custom_field_type NOT NULL DEFAULT 'text',
  options JSONB DEFAULT '[]', -- for 'list' type
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'show_when_filled', -- 'always_show', 'always_hide', 'show_when_filled'
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, field_key)
);

-- =============================================
-- 5. CONTACT SEGMENTS
-- =============================================
CREATE TABLE contact_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]', -- array of filter conditions
  contact_count INT DEFAULT 0,
  created_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 6. CONVERSATION ENHANCEMENTS
-- =============================================
-- Add snooze and closing notes to conversations
ALTER TABLE conversations ADD COLUMN snoozed_until TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN closing_category TEXT;
ALTER TABLE conversations ADD COLUMN closing_notes TEXT;
ALTER TABLE conversations ADD COLUMN closed_by UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN first_response_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN first_assigned_at TIMESTAMPTZ;

-- Closing note categories
CREATE TABLE closing_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- =============================================
-- 7. CONTACT ACTIVITIES LOG
-- =============================================
CREATE TABLE contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'lifecycle_change', 'tag_added', 'tag_removed', 'field_updated', 'conversation_opened', 'conversation_closed', 'assigned', 'note_added'
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  performed_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 8. CONVERSATION ASSIGNMENT RULES
-- =============================================
CREATE TABLE assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'round_robin', -- 'round_robin', 'least_busy', 'manual'
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 9. AI KNOWLEDGE SOURCES (for AI agents)
-- =============================================
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_config_id UUID REFERENCES ai_config(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'file', 'url', 'text'
  name TEXT NOT NULL,
  content TEXT, -- for text type
  url TEXT, -- for url type
  file_path TEXT, -- for file type
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'processing', 'error'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 10. INDEXES
-- =============================================
CREATE INDEX idx_teams_org ON teams(organization_id);
CREATE INDEX idx_agent_teams_agent ON agent_teams(agent_id);
CREATE INDEX idx_agent_teams_team ON agent_teams(team_id);
CREATE INDEX idx_lifecycle_stages_org ON lifecycle_stages(organization_id, position);
CREATE INDEX idx_lifecycle_history_contact ON lifecycle_history(contact_id, created_at DESC);
CREATE INDEX idx_tags_org ON tags(organization_id);
CREATE INDEX idx_contact_fields_org ON contact_field_definitions(organization_id, position);
CREATE INDEX idx_segments_org ON contact_segments(organization_id);
CREATE INDEX idx_activities_contact ON contact_activities(contact_id, created_at DESC);
CREATE INDEX idx_conversations_snoozed ON conversations(snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX idx_knowledge_sources_ai ON knowledge_sources(ai_config_id);

-- =============================================
-- 11. RLS POLICIES
-- =============================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_own_org" ON teams FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "agent_teams_own_org" ON agent_teams FOR ALL USING (team_id IN (SELECT id FROM teams WHERE organization_id = get_agent_org_id()));
CREATE POLICY "lifecycle_stages_own_org" ON lifecycle_stages FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "lifecycle_history_own_org" ON lifecycle_history FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "tags_own_org" ON tags FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "contact_fields_own_org" ON contact_field_definitions FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "segments_own_org" ON contact_segments FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "closing_categories_own_org" ON closing_categories FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "activities_own_org" ON contact_activities FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "assignment_rules_own_org" ON assignment_rules FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "knowledge_sources_own_org" ON knowledge_sources FOR ALL USING (organization_id = get_agent_org_id());

-- Trigger for segments updated_at
CREATE TRIGGER segments_updated_at
  BEFORE UPDATE ON contact_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 12. SEED DEFAULT LIFECYCLE STAGES
-- =============================================
-- These will be created per-org during registration via app code
