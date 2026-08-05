-- Durable, service-only inbox for inbound messages received after the
-- contacts entitlement is exhausted. These events are not CRM messages.
SET search_path TO smarttalk, public, auth, extensions;

CREATE TABLE IF NOT EXISTS smarttalk.contact_overage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL
    REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL
    REFERENCES smarttalk.channels(id) ON DELETE CASCADE,
  contact_id UUID
    REFERENCES smarttalk.contacts(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  provider_contact_id TEXT NOT NULL,
  provider_message_id TEXT,
  event_key TEXT NOT NULL,
  message_type TEXT NOT NULL,
  contact_name TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  CONSTRAINT contact_overage_events_source_check
    CHECK (source IN ('messenger', 'instagram', 'whatsapp')),
  CONSTRAINT contact_overage_events_status_check
    CHECK (status IN ('pending', 'released', 'discarded')),
  CONSTRAINT contact_overage_events_event_key_check
    CHECK (length(event_key) BETWEEN 1 AND 200),
  UNIQUE (channel_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_contact_overage_events_org_status
  ON smarttalk.contact_overage_events(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_overage_events_brand_status
  ON smarttalk.contact_overage_events(brand_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_overage_events_channel_created
  ON smarttalk.contact_overage_events(channel_id, created_at DESC);

ALTER TABLE smarttalk.contact_overage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON smarttalk.contact_overage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON smarttalk.contact_overage_events TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'smarttalk'
      AND tablename = 'contact_overage_events'
      AND policyname = 'contact_overage_events_service_only'
  ) THEN
    CREATE POLICY "contact_overage_events_service_only"
      ON smarttalk.contact_overage_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE smarttalk.contact_overage_events IS
  'Service-only durable inbox for messages received after contacts quota exhaustion. It is released or discarded by backend workers and is never shown directly in CRM.';
COMMENT ON COLUMN smarttalk.contact_overage_events.provider_contact_id IS
  'Provider identifier retained only in this service-role table so a future plan upgrade can replay the event.';
COMMENT ON COLUMN smarttalk.contact_overage_events.payload IS
  'Minimum provider message payload required for replay. Contains private provider data and must never be selected by client-facing queries.';
COMMENT ON COLUMN smarttalk.contact_overage_events.event_key IS
  'Stable idempotency key. Usually the provider message id, otherwise a backend hash of the message event.';
