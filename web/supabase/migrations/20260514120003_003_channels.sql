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
