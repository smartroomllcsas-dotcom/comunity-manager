-- CommunityManager QA data set: Demo Inicial at plan limits.
--
-- PURPOSE
--   Populate the paid QA organization with deterministic, synthetic data so
--   billing limits, brand isolation, channel routing, and inbox rendering can
--   be tested without connecting real Meta or WhatsApp accounts.
--
-- SAFETY
--   * This is NOT a migration and is never executed automatically.
--   * It only targets the organization named "QA Agencia Inicial" with an
--     active subscription.
--   * It refuses to run when that organization already has a real active
--     channel. Synthetic channels are marked config.qa_seed = true.
--   * It creates no OAuth/social account tokens and never calls a provider.
--
-- EXPECTED RESULT FOR THE CURRENT DEMO INICIAL PLAN
--   brands.total       5 / 5
--   channels.active    3 / 3
--   contacts.total     1,000 / 1,000
--   agency.users       2 / 2 (one existing admin + one synthetic invitation)
--   brand.advisors     5 / 5 (synthetic invitations, one per brand)
--   broadcasts.month   10 / 10 (completed synthetic records, never sent)
--   automations.flows  2 / 2 (inactive synthetic flows)
--   One synthetic inbound conversation per channel is added to the Inbox.

BEGIN;

SET LOCAL search_path TO smarttalk, public, auth, extensions;

CREATE TEMP TABLE qa_seed_channels (
  seed_code TEXT PRIMARY KEY,
  channel_id UUID NOT NULL,
  brand_id UUID NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_org_id UUID;
  v_plan_id UUID;
  v_cm_user_id UUID;
  v_max_brands INTEGER;
  v_max_channels INTEGER;
  v_max_contacts INTEGER;
  v_brand_count INTEGER;
  v_active_channel_count INTEGER;
  v_contact_count INTEGER;
  v_remaining INTEGER;
  v_brand_id UUID;
  v_channel_id UUID;
  v_contact_id UUID;
  v_conversation_id UUID;
  v_channel_brand_id UUID;
  v_seed_code TEXT;
  v_channel_type TEXT;
  v_channel_name TEXT;
  v_brand_name TEXT;
  v_wa_id TEXT;
  v_contact_name TEXT;
  v_message TEXT;
  v_index INTEGER;
  v_channel_index INTEGER;
BEGIN
  SELECT organization_id, plan_id
  INTO v_org_id, v_plan_id
  FROM (
    SELECT
      organization_id,
      plan_id,
      ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at DESC) AS position
    FROM smarttalk.subscriptions
    WHERE status = 'active'
  ) AS active_subscription
  WHERE position = 1
    AND organization_id = (
      SELECT id
      FROM smarttalk.organizations
      WHERE name = 'QA Agencia Inicial'
      ORDER BY created_at DESC
      LIMIT 1
    );

  IF v_org_id IS NULL OR v_plan_id IS NULL THEN
    RAISE EXCEPTION
      'QA seed stopped: QA Agencia Inicial must have an active subscription.';
  END IF;

  SELECT cm_user.id
  INTO v_cm_user_id
  FROM public.cm_users AS cm_user
  INNER JOIN smarttalk.agents AS agent
    ON LOWER(agent.email) = LOWER(cm_user.email)
  WHERE agent.organization_id = v_org_id
    AND agent.role = 'admin'
  ORDER BY agent.created_at
  LIMIT 1;

  IF v_cm_user_id IS NULL THEN
    RAISE EXCEPTION
      'QA seed stopped: no linked admin exists in public.cm_users.';
  END IF;

  SELECT limit_value
  INTO v_max_brands
  FROM smarttalk.plan_entitlements
  WHERE plan_id = v_plan_id
    AND feature_code = 'brands.total'
    AND enabled;

  SELECT limit_value
  INTO v_max_channels
  FROM smarttalk.plan_entitlements
  WHERE plan_id = v_plan_id
    AND feature_code = 'channels.active'
    AND enabled;

  SELECT max_contacts
  INTO v_max_contacts
  FROM smarttalk.plans
  WHERE id = v_plan_id;

  IF v_max_brands IS NULL OR v_max_channels IS NULL OR v_max_contacts IS NULL
     OR v_max_brands < 1 OR v_max_channels < 3 OR v_max_contacts < 3 THEN
    RAISE EXCEPTION
      'QA seed stopped: current plan must expose finite limits for at least 1 brand, 3 channels, and 3 contacts.';
  END IF;

  SELECT COUNT(*)
  INTO v_brand_count
  FROM public.cm_clients
  WHERE smarttalk_organization_id = v_org_id;

  IF v_brand_count > v_max_brands THEN
    RAISE EXCEPTION
      'QA seed stopped: organization already has % brands but plan limit is %.',
      v_brand_count, v_max_brands;
  END IF;

  -- Reuse the existing first QA brand and create only the missing QA brands.
  FOR v_index IN 1..v_max_brands LOOP
    v_brand_name := CASE
      WHEN v_index = 1 THEN '[QA] Marca Demo Inicial'
      ELSE FORMAT('[QA] Marca Limite %s', LPAD(v_index::TEXT, 2, '0'))
    END;

    SELECT id
    INTO v_brand_id
    FROM public.cm_clients
    WHERE smarttalk_organization_id = v_org_id
      AND name = v_brand_name
    ORDER BY created_at
    LIMIT 1;

    IF v_brand_id IS NULL THEN
      SELECT COUNT(*) INTO v_brand_count
      FROM public.cm_clients
      WHERE smarttalk_organization_id = v_org_id;

      IF v_brand_count >= v_max_brands THEN
        RAISE EXCEPTION
          'QA seed stopped: existing non-QA brands already consume the remaining brand slots.';
      END IF;

      INSERT INTO public.cm_clients (
        user_id,
        smarttalk_organization_id,
        name,
        industry,
        platforms,
        language,
        status
      ) VALUES (
        v_cm_user_id,
        v_org_id,
        v_brand_name,
        'QA - prueba de limites',
        ARRAY['Instagram', 'Facebook', 'WhatsApp'],
        'es',
        'onboarding'
      )
      RETURNING id INTO v_brand_id;
    END IF;
  END LOOP;

  SELECT COUNT(*)
  INTO v_active_channel_count
  FROM smarttalk.channels
  WHERE organization_id = v_org_id
    AND status = 'active';

  IF EXISTS (
    SELECT 1
    FROM smarttalk.channels
    WHERE organization_id = v_org_id
      AND status = 'active'
      AND COALESCE(config ->> 'qa_seed', 'false') <> 'true'
  ) THEN
    RAISE EXCEPTION
      'QA seed stopped: real active channels exist in QA Agencia Inicial. No channel was modified.';
  END IF;

  IF v_active_channel_count > v_max_channels THEN
    RAISE EXCEPTION
      'QA seed stopped: active channel count % exceeds plan limit %.',
      v_active_channel_count, v_max_channels;
  END IF;

  -- Three synthetic active channels: one per supported platform.
  FOR v_index IN 1..3 LOOP
    v_seed_code := CASE v_index
      WHEN 1 THEN 'facebook'
      WHEN 2 THEN 'instagram'
      ELSE 'whatsapp'
    END;

    v_channel_type := CASE v_index
      WHEN 1 THEN 'facebook_messenger'
      WHEN 2 THEN 'instagram'
      ELSE 'whatsapp_cloud_api'
    END;

    v_channel_name := FORMAT('[QA] %s - Canal simulado', INITCAP(v_seed_code));

    SELECT id, brand_id
    INTO v_channel_id, v_channel_brand_id
    FROM smarttalk.channels
    WHERE organization_id = v_org_id
      AND config ->> 'qa_seed_code' = v_seed_code
    ORDER BY created_at
    LIMIT 1;

    IF v_channel_id IS NULL THEN
      SELECT id
      INTO v_channel_brand_id
      FROM public.cm_clients
      WHERE smarttalk_organization_id = v_org_id
        AND name = CASE
          WHEN v_index = 1 THEN '[QA] Marca Demo Inicial'
          ELSE FORMAT('[QA] Marca Limite %s', LPAD(v_index::TEXT, 2, '0'))
        END
      ORDER BY created_at
      LIMIT 1;

      IF v_channel_brand_id IS NULL THEN
        RAISE EXCEPTION 'QA seed stopped: brand for synthetic channel % is missing.', v_seed_code;
      END IF;

      INSERT INTO smarttalk.channels (
        organization_id,
        brand_id,
        type,
        name,
        status,
        config,
        connected_at,
        last_active_at
      ) VALUES (
        v_org_id,
        v_channel_brand_id,
        v_channel_type::smarttalk.channel_type,
        v_channel_name,
        'active'::smarttalk.channel_status,
        jsonb_build_object(
          'qa_seed', TRUE,
          'qa_seed_code', v_seed_code,
          'synthetic', TRUE,
          'non_operational', TRUE,
          'note', 'Synthetic QA channel. No provider credentials.'
        ),
        NOW(),
        NOW()
      )
      RETURNING id INTO v_channel_id;
    END IF;

    INSERT INTO qa_seed_channels(seed_code, channel_id, brand_id)
    VALUES (v_seed_code, v_channel_id, v_channel_brand_id)
    ON CONFLICT (seed_code) DO UPDATE
      SET channel_id = EXCLUDED.channel_id,
          brand_id = EXCLUDED.brand_id;
  END LOOP;

  SELECT COUNT(*)
  INTO v_contact_count
  FROM smarttalk.contacts
  WHERE organization_id = v_org_id;

  IF v_contact_count > v_max_contacts THEN
    RAISE EXCEPTION
      'QA seed stopped: contact count % exceeds plan limit %.',
      v_contact_count, v_max_contacts;
  END IF;

  -- Fill the remaining contact allowance. Contacts are distributed across
  -- the three synthetic channels and inherit each channel's brand scope.
  v_remaining := v_max_contacts - v_contact_count;
  FOR v_index IN 1..v_remaining LOOP
    v_channel_index := ((v_index - 1) % 3) + 1;
    v_seed_code := CASE v_channel_index
      WHEN 1 THEN 'facebook'
      WHEN 2 THEN 'instagram'
      ELSE 'whatsapp'
    END;

    SELECT brand_id INTO v_channel_brand_id
    FROM qa_seed_channels
    WHERE seed_code = v_seed_code;

    v_wa_id := FORMAT('qa-%s-%s', v_seed_code, LPAD(v_index::TEXT, 5, '0'));
    v_contact_name := FORMAT('QA Lead %s %s', INITCAP(v_seed_code), LPAD(v_index::TEXT, 5, '0'));

    INSERT INTO smarttalk.contacts (
      organization_id,
      brand_id,
      wa_id,
      name,
      tags,
      custom_fields
    ) VALUES (
      v_org_id,
      v_channel_brand_id,
      v_wa_id,
      v_contact_name,
      ARRAY['qa-seed', 'synthetic'],
      jsonb_build_object(
        'qa_seed', TRUE,
        'synthetic', TRUE,
        'seed_channel', v_seed_code
      )
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Add one visible inbound conversation and message per simulated channel.
  FOR v_index IN 1..3 LOOP
    v_seed_code := CASE v_index
      WHEN 1 THEN 'facebook'
      WHEN 2 THEN 'instagram'
      ELSE 'whatsapp'
    END;

    SELECT channel_id, brand_id
    INTO v_channel_id, v_channel_brand_id
    FROM qa_seed_channels
    WHERE seed_code = v_seed_code;

    SELECT id
    INTO v_contact_id
    FROM smarttalk.contacts
    WHERE organization_id = v_org_id
      AND brand_id = v_channel_brand_id
      AND custom_fields ->> 'qa_seed' = 'true'
      AND custom_fields ->> 'seed_channel' = v_seed_code
      AND wa_id = FORMAT('qa-%s-%s', v_seed_code, LPAD(v_index::TEXT, 5, '0'))
    LIMIT 1;

    IF v_contact_id IS NULL THEN
      CONTINUE;
    END IF;

    v_message := FORMAT('Mensaje de prueba QA recibido por %s.', INITCAP(v_seed_code));

    SELECT id
    INTO v_conversation_id
    FROM smarttalk.conversations
    WHERE organization_id = v_org_id
      AND contact_id = v_contact_id
      AND metadata ->> 'qa_seed' = 'true'
    ORDER BY created_at
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
      INSERT INTO smarttalk.conversations (
        organization_id,
        brand_id,
        channel_id,
        contact_id,
        status,
        priority,
        unread_count,
        last_message_preview,
        metadata
      ) VALUES (
        v_org_id,
        v_channel_brand_id,
        v_channel_id,
        v_contact_id,
        'open'::smarttalk.conversation_status,
        'medium'::smarttalk.conversation_priority,
        1,
        v_message,
        jsonb_build_object(
          'qa_seed', TRUE,
          'synthetic', TRUE,
          'seed_channel', v_seed_code
        )
      )
      RETURNING id INTO v_conversation_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM smarttalk.messages
      WHERE wa_message_id = FORMAT('qa-seed:%s', v_seed_code)
    ) THEN
      INSERT INTO smarttalk.messages (
        conversation_id,
        contact_id,
        direction,
        type,
        content,
        wa_message_id,
        status,
        is_bot
      ) VALUES (
        v_conversation_id,
        v_contact_id,
        'inbound'::smarttalk.message_direction,
        'text'::smarttalk.message_type,
        jsonb_build_object('type', 'text', 'text', v_message),
        FORMAT('qa-seed:%s', v_seed_code),
        'delivered'::smarttalk.message_status,
        FALSE
      );
    END IF;

    UPDATE smarttalk.contacts
    SET last_message_at = NOW()
    WHERE id = v_contact_id;

    UPDATE smarttalk.conversations
    SET last_message_preview = v_message,
        unread_count = GREATEST(unread_count, 1),
        updated_at = NOW()
    WHERE id = v_conversation_id;
  END LOOP;

  RAISE NOTICE
    'QA seed complete for organization %: plan %, brands %, active channels %, contacts %.',
    v_org_id,
    v_plan_id,
    (SELECT COUNT(*) FROM public.cm_clients WHERE smarttalk_organization_id = v_org_id),
    (SELECT COUNT(*) FROM smarttalk.channels WHERE organization_id = v_org_id AND status = 'active'),
    (SELECT COUNT(*) FROM smarttalk.contacts WHERE organization_id = v_org_id);
END $$;

-- Fill team, broadcast, and automation entitlements without creating real
-- accounts, sending invitations by email, or calling any provider.
DO $$
DECLARE
  v_org_id UUID;
  v_plan_id UUID;
  v_admin_id UUID;
  v_max_agency_users INTEGER;
  v_max_advisors INTEGER;
  v_max_brands INTEGER;
  v_max_broadcasts INTEGER;
  v_max_flows INTEGER;
  v_agency_users INTEGER;
  v_advisors INTEGER;
  v_broadcasts INTEGER;
  v_flows INTEGER;
  v_invitation_id UUID;
  v_brand_id UUID;
  v_template_id UUID;
  v_name TEXT;
  v_index INTEGER;
BEGIN
  SELECT id, plan_id INTO v_org_id, v_plan_id
  FROM smarttalk.organizations
  WHERE name = 'QA Agencia Inicial'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT id INTO v_admin_id
  FROM smarttalk.agents
  WHERE organization_id = v_org_id
    AND role = 'admin'
  ORDER BY created_at
  LIMIT 1;

  SELECT limit_value INTO v_max_agency_users
  FROM smarttalk.plan_entitlements
  WHERE plan_id = v_plan_id AND feature_code = 'agency.users' AND enabled;
  SELECT limit_value INTO v_max_advisors
  FROM smarttalk.plan_entitlements
  WHERE plan_id = v_plan_id AND feature_code = 'brand.advisors_total' AND enabled;
  SELECT limit_value INTO v_max_brands
  FROM smarttalk.plan_entitlements
  WHERE plan_id = v_plan_id AND feature_code = 'brands.total' AND enabled;
  SELECT limit_value INTO v_max_broadcasts
  FROM smarttalk.plan_entitlements
  WHERE plan_id = v_plan_id AND feature_code = 'broadcasts.month' AND enabled;
  SELECT limit_value INTO v_max_flows
  FROM smarttalk.plan_entitlements
  WHERE plan_id = v_plan_id AND feature_code = 'automations.flows' AND enabled;

  SELECT
    (SELECT COUNT(*) FROM smarttalk.agents WHERE organization_id = v_org_id AND member_type = 'agency_user')
    + (SELECT COUNT(*) FROM smarttalk.invitations WHERE organization_id = v_org_id AND member_type = 'agency_user' AND status = 'pending'),
    (SELECT COUNT(*) FROM smarttalk.agents WHERE organization_id = v_org_id AND member_type = 'brand_advisor')
    + (SELECT COUNT(*) FROM smarttalk.invitations WHERE organization_id = v_org_id AND member_type = 'brand_advisor' AND status = 'pending'),
    (SELECT COUNT(*) FROM smarttalk.broadcasts WHERE organization_id = v_org_id AND status <> 'draft' AND created_at >= DATE_TRUNC('month', NOW())),
    (SELECT COUNT(*) FROM smarttalk.chatbot_flows WHERE organization_id = v_org_id)
  INTO v_agency_users, v_advisors, v_broadcasts, v_flows;

  IF v_agency_users > v_max_agency_users OR v_advisors > v_max_advisors
     OR v_broadcasts > v_max_broadcasts OR v_flows > v_max_flows THEN
    RAISE EXCEPTION 'QA seed stopped: an existing usage count exceeds the active plan limits.';
  END IF;

  IF v_agency_users < v_max_agency_users THEN
    INSERT INTO smarttalk.invitations (
      organization_id, email, role, member_type, status, invited_by, expires_at
    ) VALUES (
      v_org_id, 'qa-agency-user-02@communitymanager.invalid', 'agent', 'agency_user', 'pending', v_admin_id, NOW() + INTERVAL '30 days'
    ) ON CONFLICT (organization_id, email) DO NOTHING;
  END IF;

  FOR v_index IN 1..v_max_advisors LOOP
    SELECT id INTO v_brand_id
    FROM public.cm_clients
    WHERE smarttalk_organization_id = v_org_id
    ORDER BY created_at
    OFFSET (v_index - 1) % v_max_brands
    LIMIT 1;

    INSERT INTO smarttalk.invitations (
      organization_id, email, role, member_type, status, invited_by, expires_at
    ) VALUES (
      v_org_id,
      FORMAT('qa-brand-advisor-%s@communitymanager.invalid', LPAD(v_index::TEXT, 2, '0')),
      'agent',
      'brand_advisor',
      'pending',
      v_admin_id,
      NOW() + INTERVAL '30 days'
    ) ON CONFLICT (organization_id, email) DO NOTHING;

    SELECT id INTO v_invitation_id
    FROM smarttalk.invitations
    WHERE organization_id = v_org_id
      AND email = FORMAT('qa-brand-advisor-%s@communitymanager.invalid', LPAD(v_index::TEXT, 2, '0'));

    INSERT INTO smarttalk.invitation_brand_assignments (organization_id, invitation_id, brand_id)
    VALUES (v_org_id, v_invitation_id, v_brand_id)
    ON CONFLICT (invitation_id, brand_id) DO NOTHING;
  END LOOP;

  FOR v_index IN 1..v_max_brands LOOP
    SELECT id INTO v_brand_id
    FROM public.cm_clients
    WHERE smarttalk_organization_id = v_org_id
    ORDER BY created_at
    OFFSET (v_index - 1)
    LIMIT 1;

    INSERT INTO smarttalk.invitations (
      organization_id, email, role, member_type, status, invited_by, expires_at
    ) VALUES (
      v_org_id,
      FORMAT('qa-brand-admin-%s@communitymanager.invalid', LPAD(v_index::TEXT, 2, '0')),
      'supervisor',
      'brand_admin',
      'pending',
      v_admin_id,
      NOW() + INTERVAL '30 days'
    ) ON CONFLICT (organization_id, email) DO NOTHING;

    SELECT id INTO v_invitation_id
    FROM smarttalk.invitations
    WHERE organization_id = v_org_id
      AND email = FORMAT('qa-brand-admin-%s@communitymanager.invalid', LPAD(v_index::TEXT, 2, '0'));

    INSERT INTO smarttalk.invitation_brand_assignments (organization_id, invitation_id, brand_id)
    VALUES (v_org_id, v_invitation_id, v_brand_id)
    ON CONFLICT (invitation_id, brand_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_template_id
  FROM smarttalk.message_templates
  WHERE organization_id = v_org_id
    AND name = '[QA] Plantilla Sintética'
  ORDER BY created_at
  LIMIT 1;

  IF v_template_id IS NULL THEN
    INSERT INTO smarttalk.message_templates (
      organization_id, name, language, category, components, status
    ) VALUES (
      v_org_id, '[QA] Plantilla Sintética', 'es', 'utility', '[]'::JSONB, 'approved'
    ) RETURNING id INTO v_template_id;
  END IF;

  FOR v_index IN 1..v_max_broadcasts LOOP
    v_name := FORMAT('[QA] Difusión Sintética %s', LPAD(v_index::TEXT, 2, '0'));
    IF NOT EXISTS (
      SELECT 1 FROM smarttalk.broadcasts
      WHERE organization_id = v_org_id AND name = v_name
    ) THEN
      INSERT INTO smarttalk.broadcasts (
        organization_id, name, template_id, channel_id, contact_filter, status
      ) VALUES (
        v_org_id,
        v_name,
        v_template_id,
        (SELECT channel_id FROM qa_seed_channels ORDER BY seed_code LIMIT 1),
        '{"qa_seed": true, "synthetic": true}'::JSONB,
        'completed'
      );
    END IF;
  END LOOP;

  FOR v_index IN 1..v_max_flows LOOP
    v_name := FORMAT('[QA] Flujo Sintético %s', LPAD(v_index::TEXT, 2, '0'));
    IF NOT EXISTS (
      SELECT 1 FROM smarttalk.chatbot_flows
      WHERE organization_id = v_org_id AND name = v_name
    ) THEN
      INSERT INTO smarttalk.chatbot_flows (
        organization_id, name, trigger_type, trigger_value, flow_data, is_active
      ) VALUES (
        v_org_id,
        v_name,
        'keyword',
        FORMAT('qa-flow-%s', LPAD(v_index::TEXT, 2, '0')),
        '{"nodes": []}'::JSONB,
        FALSE
      );
    END IF;
  END LOOP;
END $$;

SELECT jsonb_build_object(
  'organization', organization.name,
  'plan', plan.name,
  'brands', (
    SELECT COUNT(*)
    FROM public.cm_clients AS brand
    WHERE brand.smarttalk_organization_id = organization.id
  ),
  'active_channels', (
    SELECT COUNT(*)
    FROM smarttalk.channels AS channel
    WHERE channel.organization_id = organization.id
      AND channel.status = 'active'
  ),
  'synthetic_channels', (
    SELECT COUNT(*)
    FROM smarttalk.channels AS channel
    WHERE channel.organization_id = organization.id
      AND channel.config ->> 'qa_seed' = 'true'
  ),
  'contacts', (
    SELECT COUNT(*)
    FROM smarttalk.contacts AS contact
    WHERE contact.organization_id = organization.id
  ),
  'agency_users', (
    SELECT COUNT(*)
    FROM smarttalk.agents AS agent
    WHERE agent.organization_id = organization.id
      AND agent.member_type = 'agency_user'
  ) + (
    SELECT COUNT(*)
    FROM smarttalk.invitations AS invitation
    WHERE invitation.organization_id = organization.id
      AND invitation.member_type = 'agency_user'
      AND invitation.status = 'pending'
  ),
  'brand_advisors', (
    SELECT COUNT(*)
    FROM smarttalk.agents AS agent
    WHERE agent.organization_id = organization.id
      AND agent.member_type = 'brand_advisor'
  ) + (
    SELECT COUNT(*)
    FROM smarttalk.invitations AS invitation
    WHERE invitation.organization_id = organization.id
      AND invitation.member_type = 'brand_advisor'
      AND invitation.status = 'pending'
  ),
  'brand_administrators', (
    SELECT COUNT(*)
    FROM smarttalk.agents AS agent
    WHERE agent.organization_id = organization.id
      AND agent.member_type = 'brand_admin'
  ) + (
    SELECT COUNT(*)
    FROM smarttalk.invitations AS invitation
    WHERE invitation.organization_id = organization.id
      AND invitation.member_type = 'brand_admin'
      AND invitation.status = 'pending'
  ),
  'broadcasts', (
    SELECT COUNT(*)
    FROM smarttalk.broadcasts AS broadcast
    WHERE broadcast.organization_id = organization.id
      AND broadcast.status <> 'draft'
      AND broadcast.created_at >= DATE_TRUNC('month', NOW())
  ),
  'flows', (
    SELECT COUNT(*)
    FROM smarttalk.chatbot_flows AS flow
    WHERE flow.organization_id = organization.id
  ),
  'synthetic_conversations', (
    SELECT COUNT(*)
    FROM smarttalk.conversations AS conversation
    WHERE conversation.organization_id = organization.id
      AND conversation.metadata ->> 'qa_seed' = 'true'
  )
) AS qa_seed_result
FROM smarttalk.organizations AS organization
INNER JOIN smarttalk.plans AS plan ON plan.id = organization.plan_id
WHERE organization.name = 'QA Agencia Inicial'
ORDER BY organization.created_at DESC
LIMIT 1;

COMMIT;
