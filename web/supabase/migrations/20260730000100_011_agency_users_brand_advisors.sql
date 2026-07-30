-- Separate agency users from brand advisors without changing channel access.
-- Billing enforcement remains controlled by BILLING_ENFORCEMENT_MODE.
SET search_path TO smarttalk, public, auth, extensions;

ALTER TABLE smarttalk.agents
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'agency_user',
  ADD CONSTRAINT agents_member_type_check
    CHECK (member_type IN ('agency_user', 'brand_advisor'));

ALTER TABLE smarttalk.invitations
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'agency_user',
  ADD CONSTRAINT invitations_member_type_check
    CHECK (member_type IN ('agency_user', 'brand_advisor'));

CREATE INDEX IF NOT EXISTS idx_agents_org_member_type
  ON smarttalk.agents(organization_id, member_type);

CREATE INDEX IF NOT EXISTS idx_invitations_org_member_type_status
  ON smarttalk.invitations(organization_id, member_type, status);

CREATE TABLE IF NOT EXISTS smarttalk.brand_advisor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL
    REFERENCES smarttalk.agents(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL
    REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  created_by UUID
    REFERENCES smarttalk.agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, brand_id)
);

CREATE TABLE IF NOT EXISTS smarttalk.invitation_brand_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES smarttalk.organizations(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL
    REFERENCES smarttalk.invitations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL
    REFERENCES public.cm_clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invitation_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_advisor_assignments_org_brand
  ON smarttalk.brand_advisor_assignments(organization_id, brand_id);

CREATE INDEX IF NOT EXISTS idx_invitation_brand_assignments_org_brand
  ON smarttalk.invitation_brand_assignments(organization_id, brand_id);

CREATE OR REPLACE FUNCTION smarttalk.validate_brand_advisor_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_agent_org UUID;
  v_member_type TEXT;
  v_brand_org UUID;
BEGIN
  SELECT organization_id, member_type
  INTO v_agent_org, v_member_type
  FROM smarttalk.agents
  WHERE id = NEW.agent_id;

  SELECT smarttalk_organization_id
  INTO v_brand_org
  FROM public.cm_clients
  WHERE id = NEW.brand_id;

  IF v_member_type <> 'brand_advisor' THEN
    RAISE EXCEPTION 'Only brand advisors can receive brand assignments';
  END IF;
  IF v_agent_org IS NULL OR v_agent_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Agent does not belong to assignment organization';
  END IF;
  IF v_brand_org IS NULL OR v_brand_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Brand does not belong to assignment organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = smarttalk, public;

CREATE OR REPLACE FUNCTION smarttalk.validate_invitation_brand_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation_org UUID;
  v_member_type TEXT;
  v_brand_org UUID;
BEGIN
  SELECT organization_id, member_type
  INTO v_invitation_org, v_member_type
  FROM smarttalk.invitations
  WHERE id = NEW.invitation_id;

  SELECT smarttalk_organization_id
  INTO v_brand_org
  FROM public.cm_clients
  WHERE id = NEW.brand_id;

  IF v_member_type <> 'brand_advisor' THEN
    RAISE EXCEPTION 'Only brand advisor invitations can receive brands';
  END IF;
  IF v_invitation_org IS NULL OR v_invitation_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Invitation does not belong to assignment organization';
  END IF;
  IF v_brand_org IS NULL OR v_brand_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Brand does not belong to assignment organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = smarttalk, public;

DROP TRIGGER IF EXISTS validate_brand_advisor_assignment
  ON smarttalk.brand_advisor_assignments;
CREATE TRIGGER validate_brand_advisor_assignment
  BEFORE INSERT OR UPDATE ON smarttalk.brand_advisor_assignments
  FOR EACH ROW EXECUTE FUNCTION smarttalk.validate_brand_advisor_assignment();

DROP TRIGGER IF EXISTS validate_invitation_brand_assignment
  ON smarttalk.invitation_brand_assignments;
CREATE TRIGGER validate_invitation_brand_assignment
  BEFORE INSERT OR UPDATE ON smarttalk.invitation_brand_assignments
  FOR EACH ROW EXECUTE FUNCTION smarttalk.validate_invitation_brand_assignment();

ALTER TABLE smarttalk.brand_advisor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE smarttalk.invitation_brand_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_advisor_assignments_read_own_org"
  ON smarttalk.brand_advisor_assignments FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

CREATE POLICY "invitation_brand_assignments_read_own_org"
  ON smarttalk.invitation_brand_assignments FOR SELECT
  USING (organization_id = smarttalk.get_agent_org_id());

GRANT SELECT ON smarttalk.brand_advisor_assignments TO authenticated;
GRANT SELECT ON smarttalk.invitation_brand_assignments TO authenticated;
GRANT ALL ON smarttalk.brand_advisor_assignments TO service_role;
GRANT ALL ON smarttalk.invitation_brand_assignments TO service_role;

INSERT INTO smarttalk.feature_catalog(
  code,
  name,
  description,
  limit_type,
  unit
) VALUES
  (
    'agency.users',
    'Usuarios de agencia',
    'Propietarios, administradores y colaboradores internos de la agencia',
    'quantity',
    'users'
  ),
  (
    'brand.advisors_total',
    'Asesores de marca',
    'Asesores vinculados a una o varias marcas de la agencia',
    'quantity',
    'advisors'
  ),
  (
    'brand.advisors_per_brand',
    'Asesores por marca',
    'Cantidad maxima de asesores asignados a una misma marca',
    'quantity',
    'advisors'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  limit_type = EXCLUDED.limit_type,
  unit = EXCLUDED.unit,
  updated_at = NOW();

UPDATE smarttalk.feature_catalog
SET name = 'Miembros heredados',
    description = 'Limite heredado conservado para compatibilidad; usar agency.users y brand.advisors_total',
    updated_at = NOW()
WHERE code = 'team.members';

INSERT INTO smarttalk.plan_entitlements(
  plan_id,
  feature_code,
  enabled,
  limit_value,
  reset_interval,
  overage_policy
)
SELECT
  plan_id,
  'agency.users',
  enabled,
  limit_value,
  'none',
  overage_policy
FROM smarttalk.plan_entitlements
WHERE feature_code = 'team.members'
ON CONFLICT (plan_id, feature_code) DO NOTHING;

INSERT INTO smarttalk.plan_entitlements(
  plan_id,
  feature_code,
  enabled,
  limit_value,
  reset_interval,
  overage_policy
)
SELECT id, feature_code, TRUE, NULL, 'none', 'block'
FROM smarttalk.plans
CROSS JOIN (
  VALUES ('brand.advisors_total'), ('brand.advisors_per_brand')
) AS features(feature_code)
ON CONFLICT (plan_id, feature_code) DO NOTHING;

UPDATE smarttalk.plan_entitlements entitlement
SET limit_value = limits.total_advisors
FROM (
  VALUES
    ('demo-inicial-2026', 5::BIGINT),
    ('demo-crecimiento-2026', 20::BIGINT),
    ('demo-escala-2026', 75::BIGINT)
) AS limits(plan_code, total_advisors)
JOIN smarttalk.plans plan ON plan.code = limits.plan_code
WHERE entitlement.plan_id = plan.id
  AND entitlement.feature_code = 'brand.advisors_total';

UPDATE smarttalk.plan_entitlements entitlement
SET limit_value = limits.advisors_per_brand
FROM (
  VALUES
    ('demo-inicial-2026', 2::BIGINT),
    ('demo-crecimiento-2026', 5::BIGINT),
    ('demo-escala-2026', 15::BIGINT)
) AS limits(plan_code, advisors_per_brand)
JOIN smarttalk.plans plan ON plan.code = limits.plan_code
WHERE entitlement.plan_id = plan.id
  AND entitlement.feature_code = 'brand.advisors_per_brand';

INSERT INTO smarttalk.billing_audit_events(
  organization_id,
  entity_type,
  entity_id,
  action,
  actor_type,
  correlation_id,
  after_data,
  result
)
SELECT
  id,
  'organization',
  id::TEXT,
  'member_model_initialized',
  'system',
  gen_random_uuid(),
  jsonb_build_object(
    'default_member_type', 'agency_user',
    'billing_enforcement_mode', billing_enforcement_mode,
    'migration', '011_agency_users_brand_advisors'
  ),
  'success'
FROM smarttalk.organizations;
