-- Keep over-quota inbound leads traceable without exposing private identifiers.
-- The public contact row intentionally stores only a stable masked key. The
-- original provider identifier is represented by a one-way hash in a table
-- that is available only to the backend service role.
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.contacts
  ADD COLUMN IF NOT EXISTS visibility_status TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS restricted_reason TEXT;

ALTER TABLE smarttalk.contacts
  DROP CONSTRAINT IF EXISTS contacts_visibility_status_check;

ALTER TABLE smarttalk.contacts
  ADD CONSTRAINT contacts_visibility_status_check
  CHECK (visibility_status IN ('full', 'restricted'));

CREATE INDEX IF NOT EXISTS idx_contacts_org_visibility
  ON smarttalk.contacts(organization_id, visibility_status, created_at DESC);

CREATE TABLE IF NOT EXISTS smarttalk.contact_private_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL
    REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL
    REFERENCES smarttalk.channels(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL
    REFERENCES smarttalk.contacts(id) ON DELETE CASCADE,
  external_id_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, brand_id, channel_id, external_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_contact_private_identifiers_contact
  ON smarttalk.contact_private_identifiers(contact_id);

ALTER TABLE smarttalk.contact_private_identifiers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON smarttalk.contact_private_identifiers FROM PUBLIC, anon, authenticated;
GRANT ALL ON smarttalk.contact_private_identifiers TO service_role;

COMMENT ON COLUMN smarttalk.contacts.visibility_status IS
  'full for plan-enabled contacts; restricted when the contacts entitlement is exhausted';
COMMENT ON COLUMN smarttalk.contacts.restricted_reason IS
  'backend reason for restricted visibility, for example contacts_limit';
COMMENT ON TABLE smarttalk.contact_private_identifiers IS
  'One-way channel-scoped hashes used by webhooks to match restricted contacts without storing provider identifiers';
