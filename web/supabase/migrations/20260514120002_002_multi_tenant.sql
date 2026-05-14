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
