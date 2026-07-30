-- Enforce tenant -> brand -> channel -> lead isolation for the multichannel inbox.
-- The brand is public.cm_clients; the tenant is smarttalk.organizations.
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.channels
  ADD COLUMN IF NOT EXISTS brand_id UUID;

ALTER TABLE smarttalk.contacts
  ADD COLUMN IF NOT EXISTS brand_id UUID;

ALTER TABLE smarttalk.conversations
  ADD COLUMN IF NOT EXISTS brand_id UUID;

ALTER TABLE public.cm_whatsapp_accounts
  ALTER COLUMN access_token DROP NOT NULL;

-- Backfill legacy channels from the explicit legacy client reference.
UPDATE smarttalk.channels AS channel
SET brand_id = (channel.config->>'legacy_client_id')::UUID
WHERE channel.brand_id IS NULL
  AND channel.config->>'legacy_client_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.cm_clients AS brand
    WHERE brand.id = (channel.config->>'legacy_client_id')::UUID
  );

-- Some old WhatsApp channel JSON used an obsolete client UUID. The phone number
-- is the authoritative bridge to public.cm_whatsapp_accounts.
UPDATE smarttalk.channels AS channel
SET brand_id = whatsapp.client_id,
    config = jsonb_set(
      COALESCE(channel.config, '{}'::JSONB),
      '{legacy_client_id}',
      to_jsonb(whatsapp.client_id::TEXT),
      TRUE
    )
FROM public.cm_whatsapp_accounts AS whatsapp
WHERE channel.brand_id IS NULL
  AND channel.whatsapp_phone_number_id = whatsapp.phone_number_id
  AND whatsapp.client_id IS NOT NULL;

-- Complete the organization bridge for pre-agency brands that already had a
-- channel. This is safe only when the brand was resolved from its own asset.
UPDATE public.cm_clients AS brand
SET smarttalk_organization_id = channel.organization_id
FROM smarttalk.channels AS channel
WHERE channel.brand_id = brand.id
  AND brand.smarttalk_organization_id IS NULL;

UPDATE smarttalk.conversations AS conversation
SET brand_id = channel.brand_id
FROM smarttalk.channels AS channel
WHERE conversation.channel_id = channel.id
  AND conversation.brand_id IS NULL;

UPDATE smarttalk.contacts AS contact
SET brand_id = resolved.brand_id
FROM (
  SELECT conversation.contact_id, MIN(conversation.brand_id::TEXT)::UUID AS brand_id
  FROM smarttalk.conversations AS conversation
  WHERE conversation.brand_id IS NOT NULL
  GROUP BY conversation.contact_id
  HAVING COUNT(DISTINCT conversation.brand_id) = 1
) AS resolved
WHERE contact.id = resolved.contact_id
  AND contact.brand_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM smarttalk.channels WHERE brand_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce brand isolation: channels without brand_id remain';
  END IF;
  IF EXISTS (SELECT 1 FROM smarttalk.contacts WHERE brand_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce brand isolation: contacts without brand_id remain';
  END IF;
  IF EXISTS (SELECT 1 FROM smarttalk.conversations WHERE brand_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce brand isolation: conversations without brand_id remain';
  END IF;
END $$;

ALTER TABLE smarttalk.channels
  ALTER COLUMN brand_id SET NOT NULL,
  ADD CONSTRAINT channels_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES public.cm_clients(id) ON DELETE CASCADE;

ALTER TABLE smarttalk.contacts
  ALTER COLUMN brand_id SET NOT NULL,
  ADD CONSTRAINT contacts_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES public.cm_clients(id) ON DELETE CASCADE;

ALTER TABLE smarttalk.conversations
  ALTER COLUMN brand_id SET NOT NULL,
  ADD CONSTRAINT conversations_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES public.cm_clients(id) ON DELETE CASCADE;

ALTER TABLE smarttalk.contacts
  DROP CONSTRAINT IF EXISTS contacts_organization_id_wa_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_org_brand_external
  ON smarttalk.contacts(organization_id, brand_id, wa_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channels_whatsapp_phone
  ON smarttalk.channels(whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channels_org_brand
  ON smarttalk.channels(organization_id, brand_id, status);

CREATE INDEX IF NOT EXISTS idx_contacts_org_brand
  ON smarttalk.contacts(organization_id, brand_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_org_brand
  ON smarttalk.conversations(organization_id, brand_id, updated_at DESC);

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
        agent.member_type <> 'brand_advisor'
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

DROP POLICY IF EXISTS "channels_own_org" ON smarttalk.channels;
CREATE POLICY "channels_own_org_brand"
  ON smarttalk.channels FOR ALL
  USING (
    organization_id = smarttalk.get_agent_org_id()
    AND smarttalk.current_agent_can_access_brand(brand_id)
  )
  WITH CHECK (
    organization_id = smarttalk.get_agent_org_id()
    AND smarttalk.current_agent_can_access_brand(brand_id)
  );

DROP POLICY IF EXISTS "contacts_own_org" ON smarttalk.contacts;
CREATE POLICY "contacts_own_org_brand"
  ON smarttalk.contacts FOR ALL
  USING (
    organization_id = smarttalk.get_agent_org_id()
    AND smarttalk.current_agent_can_access_brand(brand_id)
  )
  WITH CHECK (
    organization_id = smarttalk.get_agent_org_id()
    AND smarttalk.current_agent_can_access_brand(brand_id)
  );

DROP POLICY IF EXISTS "conversations_own_org" ON smarttalk.conversations;
CREATE POLICY "conversations_own_org_brand"
  ON smarttalk.conversations FOR ALL
  USING (
    organization_id = smarttalk.get_agent_org_id()
    AND smarttalk.current_agent_can_access_brand(brand_id)
  )
  WITH CHECK (
    organization_id = smarttalk.get_agent_org_id()
    AND smarttalk.current_agent_can_access_brand(brand_id)
  );

CREATE OR REPLACE FUNCTION smarttalk.validate_brand_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = smarttalk, public, pg_temp
AS $$
DECLARE
  brand_org UUID;
  channel_org UUID;
  channel_brand UUID;
  contact_org UUID;
  contact_brand UUID;
BEGIN
  SELECT smarttalk_organization_id
  INTO brand_org
  FROM public.cm_clients
  WHERE id = NEW.brand_id;

  IF brand_org IS NULL OR brand_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'brand % does not belong to organization %',
      NEW.brand_id, NEW.organization_id;
  END IF;

  IF TG_TABLE_NAME = 'conversations' THEN
    SELECT organization_id, brand_id
    INTO channel_org, channel_brand
    FROM smarttalk.channels
    WHERE id = NEW.channel_id;

    SELECT organization_id, brand_id
    INTO contact_org, contact_brand
    FROM smarttalk.contacts
    WHERE id = NEW.contact_id;

    IF channel_org IS DISTINCT FROM NEW.organization_id
      OR channel_brand IS DISTINCT FROM NEW.brand_id THEN
      RAISE EXCEPTION 'conversation channel is outside organization/brand scope';
    END IF;

    IF contact_org IS DISTINCT FROM NEW.organization_id
      OR contact_brand IS DISTINCT FROM NEW.brand_id THEN
      RAISE EXCEPTION 'conversation contact is outside organization/brand scope';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION smarttalk.validate_brand_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION smarttalk.validate_brand_scope() TO service_role;

DROP TRIGGER IF EXISTS channels_validate_brand_scope ON smarttalk.channels;
CREATE TRIGGER channels_validate_brand_scope
  BEFORE INSERT OR UPDATE OF organization_id, brand_id
  ON smarttalk.channels
  FOR EACH ROW EXECUTE FUNCTION smarttalk.validate_brand_scope();

DROP TRIGGER IF EXISTS contacts_validate_brand_scope ON smarttalk.contacts;
CREATE TRIGGER contacts_validate_brand_scope
  BEFORE INSERT OR UPDATE OF organization_id, brand_id
  ON smarttalk.contacts
  FOR EACH ROW EXECUTE FUNCTION smarttalk.validate_brand_scope();

DROP TRIGGER IF EXISTS conversations_validate_brand_scope ON smarttalk.conversations;
CREATE TRIGGER conversations_validate_brand_scope
  BEFORE INSERT OR UPDATE OF organization_id, brand_id, channel_id, contact_id
  ON smarttalk.conversations
  FOR EACH ROW EXECUTE FUNCTION smarttalk.validate_brand_scope();

COMMENT ON COLUMN smarttalk.channels.brand_id IS
  'Mandatory brand owner. Webhooks derive tenant and brand exclusively from this channel.';
COMMENT ON COLUMN smarttalk.contacts.brand_id IS
  'Brand-scoped lead identity; the same external ID may exist independently in another brand.';
COMMENT ON COLUMN smarttalk.conversations.brand_id IS
  'Immutable routing scope validated against both channel and contact.';
