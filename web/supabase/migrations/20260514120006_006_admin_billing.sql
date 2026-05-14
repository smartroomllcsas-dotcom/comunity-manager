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
