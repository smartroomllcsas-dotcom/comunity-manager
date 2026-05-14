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
