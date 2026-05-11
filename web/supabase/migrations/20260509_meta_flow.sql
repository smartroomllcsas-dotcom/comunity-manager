-- Meta flow database migration for Community Manager
-- Apply this in Supabase SQL Editor or via your migration pipeline.

CREATE TABLE IF NOT EXISTS cm_oauth_states (
  state TEXT PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES cm_clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_social_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES cm_clients(id) ON DELETE CASCADE,
  meta_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  page_id TEXT,
  page_name TEXT,
  page_access_token TEXT,
  instagram_id TEXT,
  instagram_username TEXT,
  ad_account_id TEXT,
  ad_account_name TEXT,
  business_id TEXT,
  scopes TEXT[] DEFAULT '{}',
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_whatsapp_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES cm_clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES cm_users(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  display_phone_number TEXT,
  verified_name TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (waba_id, phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_social_client ON cm_social_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_cm_whatsapp_client ON cm_whatsapp_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_cm_whatsapp_user ON cm_whatsapp_accounts(user_id);

ALTER TABLE cm_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_whatsapp_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cm_oauth_states' AND policyname = 'cm_oauth_states_own'
  ) THEN
    CREATE POLICY "cm_oauth_states_own" ON cm_oauth_states FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cm_social_accounts' AND policyname = 'cm_social_accounts_own'
  ) THEN
    CREATE POLICY "cm_social_accounts_own" ON cm_social_accounts FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cm_whatsapp_accounts' AND policyname = 'cm_whatsapp_accounts_own'
  ) THEN
    CREATE POLICY "cm_whatsapp_accounts_own" ON cm_whatsapp_accounts FOR ALL USING (true);
  END IF;
END $$;

COMMENT ON TABLE cm_oauth_states IS 'Temporary OAuth state tokens for Meta login flows';
COMMENT ON TABLE cm_social_accounts IS 'Connected Meta business assets per client';
COMMENT ON TABLE cm_whatsapp_accounts IS 'Connected WhatsApp Cloud API assets per client';
