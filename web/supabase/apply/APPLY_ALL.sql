-- =============================================================
-- APPLY_ALL.sql — SmartTalk schema + bridge a Community Manager
-- Target: Supabase self-hosted smartmedia (smartmedia-api.smartgenapp.com)
-- Aplicar en Supabase Studio > SQL Editor o psql como un solo run.
-- IDEMPOTENTE para 008. Las 000-007 fallarán si schema 'smarttalk' ya tiene tablas (cae en CREATE TYPE).
-- =============================================================
BEGIN;


-- =============================================================
-- BEGIN 20260514120000_000_smarttalk_setup.sql
-- =============================================================
-- =============================================================================
-- smarttalk schema bootstrap
-- =============================================================================
-- Run this FIRST in Supabase Studio (https://studio.smartgenapp.com) before
-- applying 001..007. Creates a dedicated schema so smarttalk tables live next
-- to bliss (same Postgres instance, fully isolated namespace) and grants the
-- standard Supabase roles access.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS smarttalk;

-- Allow the supabase roles to use the schema
GRANT USAGE ON SCHEMA smarttalk TO postgres, anon, authenticated, service_role;

-- Existing objects (none on first run, but safe on re-runs)
GRANT ALL ON ALL TABLES    IN SCHEMA smarttalk TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA smarttalk TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA smarttalk TO postgres, anon, authenticated, service_role;

-- Future objects created by migrations 001..007
ALTER DEFAULT PRIVILEGES IN SCHEMA smarttalk
  GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA smarttalk
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA smarttalk
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

-- =============================================================================
-- AFTER running 001..007, run on node-01 (root):
--   docker compose -f /opt/stack/supabase/docker-compose.yml exec -T rest \
--     sh -c 'echo "PGRST_DB_SCHEMAS=public,smarttalk,graphql_public,storage"'
-- Or edit /opt/stack/supabase/.env and add "smarttalk" to PGRST_DB_SCHEMAS,
-- then: docker compose restart rest kong
--
-- To enable Realtime on smarttalk tables (inbox live updates):
--   ALTER PUBLICATION supabase_realtime ADD TABLE
--     smarttalk.messages,
--     smarttalk.conversations,
--     smarttalk.contacts;
-- =============================================================================

-- END 20260514120000_000_smarttalk_setup.sql

-- =============================================================
-- BEGIN 20260514120001_001_initial_schema.sql
-- =============================================================
-- Run all migrations against the dedicated smarttalk schema.
SET search_path TO smarttalk, public, auth, extensions;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE agent_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TYPE agent_status AS ENUM ('online', 'away', 'offline');
CREATE TYPE conversation_status AS ENUM ('open', 'pending', 'resolved', 'closed');
CREATE TYPE conversation_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'audio', 'document', 'template', 'interactive', 'location', 'sticker');
CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE template_category AS ENUM ('marketing', 'utility', 'authentication');
CREATE TYPE template_status AS ENUM ('approved', 'pending', 'rejected');
CREATE TYPE broadcast_status AS ENUM ('draft', 'scheduled', 'sending', 'completed');
CREATE TYPE recipient_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE trigger_type AS ENUM ('keyword', 'first_message', 'menu_option');
CREATE TYPE ai_provider AS ENUM ('openai', 'anthropic');

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp_phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  access_token TEXT,
  webhook_verify_token TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  business_hours JSONB DEFAULT '{"timezone": "America/Bogota", "schedule": {}}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role agent_role NOT NULL DEFAULT 'agent',
  status agent_status NOT NULL DEFAULT 'offline',
  max_concurrent_chats INT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  name TEXT,
  profile_picture_url TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  UNIQUE(organization_id, wa_id)
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  status conversation_status NOT NULL DEFAULT 'open',
  priority conversation_priority NOT NULL DEFAULT 'medium',
  unread_count INT NOT NULL DEFAULT 0,
  last_message_preview TEXT,
  metadata JSONB DEFAULT '{}',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  direction message_direction NOT NULL,
  type message_type NOT NULL DEFAULT 'text',
  content JSONB NOT NULL DEFAULT '{}',
  wa_message_id TEXT,
  status message_status NOT NULL DEFAULT 'pending',
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message Templates
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wa_template_id TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  category template_category NOT NULL,
  components JSONB NOT NULL DEFAULT '[]',
  status template_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcasts
CREATE TABLE broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES message_templates(id) ON DELETE RESTRICT,
  contact_filter JSONB DEFAULT '{}',
  status broadcast_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  read_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcast Recipients
CREATE TABLE broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status recipient_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ
);

-- Chatbot Flows
CREATE TABLE chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type trigger_type NOT NULL,
  trigger_value TEXT,
  flow_data JSONB NOT NULL DEFAULT '{"nodes": []}',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Config
CREATE TABLE ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider ai_provider NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt TEXT NOT NULL DEFAULT 'Eres un asistente virtual amable y profesional.',
  knowledge_base JSONB DEFAULT '[]',
  escalation_rules JSONB DEFAULT '{"keywords": ["hablar con humano", "agente", "queja"], "max_turns": 5}',
  max_turns INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quick Replies
CREATE TABLE quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Internal Notes
CREATE TABLE internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_org_status ON conversations(organization_id, status, updated_at DESC);
CREATE INDEX idx_contacts_org_waid ON contacts(organization_id, wa_id);
CREATE INDEX idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id, status);
CREATE INDEX idx_messages_wa_id ON messages(wa_message_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_notes ENABLE ROW LEVEL SECURITY;

-- Helper: get agent's org_id
CREATE OR REPLACE FUNCTION get_agent_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM agents WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS policies
CREATE POLICY "agents_own_org" ON agents FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "contacts_own_org" ON contacts FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "conversations_own_org" ON conversations FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "messages_own_org" ON messages FOR ALL USING (conversation_id IN (SELECT id FROM conversations WHERE organization_id = get_agent_org_id()));
CREATE POLICY "templates_own_org" ON message_templates FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "broadcasts_own_org" ON broadcasts FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "broadcast_recipients_own_org" ON broadcast_recipients FOR ALL USING (broadcast_id IN (SELECT id FROM broadcasts WHERE organization_id = get_agent_org_id()));
CREATE POLICY "flows_own_org" ON chatbot_flows FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "ai_config_own_org" ON ai_config FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "quick_replies_own_org" ON quick_replies FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "internal_notes_own_org" ON internal_notes FOR ALL USING (conversation_id IN (SELECT id FROM conversations WHERE organization_id = get_agent_org_id()));
CREATE POLICY "organizations_own" ON organizations FOR ALL USING (id = get_agent_org_id());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- END 20260514120001_001_initial_schema.sql

-- =============================================================
-- BEGIN 20260514120002_002_multi_tenant.sql
-- =============================================================
SET search_path TO smarttalk, public, auth, extensions;

-- Plans
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  max_agents INT NOT NULL DEFAULT 2,
  max_contacts INT NOT NULL DEFAULT 500,
  max_broadcasts_per_month INT NOT NULL DEFAULT 5,
  max_chatbot_flows INT NOT NULL DEFAULT 3,
  ai_enabled BOOLEAN DEFAULT FALSE,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add plan_id, trial, and active flag to organizations
ALTER TABLE organizations ADD COLUMN plan_id UUID REFERENCES plans(id);
ALTER TABLE organizations ADD COLUMN trial_ends_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- Invitation status enum
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');

-- Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role agent_role NOT NULL DEFAULT 'agent',
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, email)
);

-- Indexes
CREATE INDEX idx_invitations_org_email ON invitations(organization_id, email);
CREATE INDEX idx_invitations_org_status ON invitations(organization_id, status);
CREATE INDEX idx_invitations_email ON invitations(email);

-- Seed default plans
INSERT INTO plans (name, max_agents, max_contacts, max_broadcasts_per_month, max_chatbot_flows, ai_enabled, price_monthly) VALUES
  ('free',         2,      500,    5,    3,    FALSE,  0.00),
  ('starter',      5,     2000,   20,   10,    TRUE,  29.00),
  ('professional', 15,   10000,   -1,   -1,    TRUE,  79.00),
  ('enterprise',   -1,      -1,   -1,   -1,    TRUE, 199.00);

-- Enable RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS: plans are read-only for all authenticated users
CREATE POLICY "plans_read_all" ON plans FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS: invitations visible/manageable only within own org
CREATE POLICY "invitations_own_org" ON invitations FOR ALL USING (organization_id = get_agent_org_id());

-- Allow public read of pending invitations by token (for the accept invite page)
CREATE POLICY "invitations_read_by_id" ON invitations FOR SELECT USING (status = 'pending');

-- Allow authenticated users to INSERT organizations (registration flow)
CREATE POLICY "organizations_insert" ON organizations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- END 20260514120002_002_multi_tenant.sql

-- =============================================================
-- BEGIN 20260514120003_003_channels.sql
-- =============================================================
SET search_path TO smarttalk, public, auth, extensions;

-- Channel types
CREATE TYPE channel_type AS ENUM ('whatsapp_business_api', 'whatsapp_cloud_api', 'facebook_messenger', 'instagram', 'telegram', 'tiktok', 'webchat', 'custom');
CREATE TYPE channel_status AS ENUM ('active', 'disconnected', 'pending', 'error');

-- Channels table (replaces direct WhatsApp credentials on organizations)
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type channel_type NOT NULL,
  name TEXT NOT NULL, -- e.g. "WhatsApp Business - +57 300 123 4567"
  status channel_status NOT NULL DEFAULT 'pending',

  -- WhatsApp specific
  whatsapp_phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  whatsapp_phone_number TEXT, -- the actual phone number for display

  -- Auth
  access_token TEXT, -- encrypted/stored securely

  -- Facebook/Meta specific
  facebook_app_id TEXT,
  meta_business_id TEXT,

  -- General config
  config JSONB DEFAULT '{}', -- channel-specific config

  -- Metadata
  connected_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update conversations to link to a channel
ALTER TABLE conversations ADD COLUMN channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;

-- Index for webhook lookup (find channel by phone_number_id)
CREATE INDEX idx_channels_org ON channels(organization_id);
CREATE INDEX idx_channels_phone ON channels(whatsapp_phone_number_id);
CREATE INDEX idx_channels_type_status ON channels(type, status);

-- RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels_own_org" ON channels FOR ALL USING (organization_id = get_agent_org_id());

-- Trigger for updated_at
CREATE TRIGGER channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Allow webhook processing to find channels without auth (service role handles this)

-- END 20260514120003_003_channels.sql

-- =============================================================
-- BEGIN 20260514120004_004_fixes.sql
-- =============================================================
SET search_path TO smarttalk, public, auth, extensions;

-- Add channel_id to broadcasts for multi-channel support
ALTER TABLE broadcasts ADD COLUMN channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;

-- Add token_expires_at to channels for token refresh tracking
ALTER TABLE channels ADD COLUMN token_expires_at TIMESTAMPTZ;

-- Index for token refresh cron job
CREATE INDEX idx_channels_token_expiry ON channels(token_expires_at) WHERE status = 'active';

-- END 20260514120004_004_fixes.sql

-- =============================================================
-- BEGIN 20260514120005_005_respond_io_features.sql
-- =============================================================
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

-- END 20260514120005_005_respond_io_features.sql

-- =============================================================
-- BEGIN 20260514120006_006_admin_billing.sql
-- =============================================================
SET search_path TO smarttalk, public, auth, extensions;

-- Super admin flag
ALTER TABLE agents ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE;

-- Subscriptions table for ePayco billing
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'trial', -- 'trial', 'active', 'past_due', 'cancelled', 'suspended'
  epayco_subscription_id TEXT, -- ePayco subscription reference
  epayco_customer_id TEXT, -- ePayco customer ID
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  payment_method TEXT, -- 'credit_card', 'pse', 'cash'
  last_payment_at TIMESTAMPTZ,
  last_payment_amount DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment history
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  epayco_ref TEXT, -- ePayco transaction reference
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'COP',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'failed'
  payment_method TEXT,
  description TEXT,
  epayco_response JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking per billing period
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  contacts_count INT DEFAULT 0,
  messages_sent INT DEFAULT 0,
  broadcasts_sent INT DEFAULT 0,
  agents_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, period_start)
);

-- Indexes
CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_payments_org ON payments(organization_id, created_at DESC);
CREATE INDEX idx_usage_org_period ON usage_records(organization_id, period_start);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Org members can view their own subscription
CREATE POLICY "subscriptions_own_org" ON subscriptions FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "payments_own_org" ON payments FOR ALL USING (organization_id = get_agent_org_id());
CREATE POLICY "usage_own_org" ON usage_records FOR ALL USING (organization_id = get_agent_org_id());

-- Updated_at trigger
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- END 20260514120006_006_admin_billing.sql

-- =============================================================
-- BEGIN 20260514120007_007_respond_io_channel.sql
-- =============================================================
SET search_path TO smarttalk, public, auth, extensions;

-- 007_respond_io_channel.sql
-- Add Respond.io as a channel provider.
-- Credentials live in channels.config (JSONB): { apiToken, respondChannelId, respondChannelType, webhookSecret? }

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'channel_type' AND e.enumlabel = 'respond_io'
  ) THEN
    ALTER TYPE channel_type ADD VALUE 'respond_io';
  END IF;
END$$;

-- Optional indexed reference to the Respond.io workspace-level channel id
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS respond_io_channel_id TEXT;

CREATE INDEX IF NOT EXISTS idx_channels_respond_io_channel_id
  ON channels (respond_io_channel_id)
  WHERE respond_io_channel_id IS NOT NULL;

COMMENT ON COLUMN channels.respond_io_channel_id IS
  'Respond.io channelId for this connected channel. See channels.config for apiToken and metadata.';

-- END 20260514120007_007_respond_io_channel.sql

-- =============================================================
-- BEGIN 20260514120008_cm_smarttalk_bridge.sql
-- =============================================================
-- Enlaza clientes de Community Manager con organizaciones SmartTalk (inbox multicanal).
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.organizations
  ADD COLUMN IF NOT EXISTS cm_client_id UUID REFERENCES public.cm_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_cm_client_id
  ON smarttalk.organizations(cm_client_id);

ALTER TABLE public.cm_clients
  ADD COLUMN IF NOT EXISTS smarttalk_organization_id UUID REFERENCES smarttalk.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cm_clients_smarttalk_organization_id
  ON public.cm_clients(smarttalk_organization_id);

-- END 20260514120008_cm_smarttalk_bridge.sql

-- Sanity checks finales
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='smarttalk') THEN
    RAISE EXCEPTION 'schema smarttalk NO creado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cm_clients' AND column_name='smarttalk_organization_id') THEN
    RAISE EXCEPTION 'cm_clients.smarttalk_organization_id NO creada';
  END IF;
  RAISE NOTICE 'OK migrations aplicadas';
END$$;

COMMIT;

-- Post-deploy (correr a mano DESPUES del COMMIT, no van en transaccion):
-- 1) Habilitar Realtime en tablas del inbox:
--    ALTER PUBLICATION supabase_realtime ADD TABLE smarttalk.messages, smarttalk.conversations, smarttalk.contacts;
-- 2) Exponer schema 'smarttalk' en PostgREST: editar PGRST_DB_SCHEMAS=public,smarttalk,... y restart 'rest' + 'kong'.
