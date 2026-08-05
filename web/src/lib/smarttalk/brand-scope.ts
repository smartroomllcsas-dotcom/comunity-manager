import { createAdminClient } from "@/lib/supabase/admin";

export type BrandScopedMemberType = "brand_admin" | "brand_advisor";

export interface BrandScopeAgent {
  id: string;
  organization_id: string;
  member_type?: string | null;
  is_super_admin?: boolean | null;
}

export function isBrandScopedMember(agent: {
  member_type?: string | null;
}) {
  return (
    agent.member_type === "brand_admin" ||
    agent.member_type === "brand_advisor"
  );
}

export async function getBrandScopeAgent(userId: string): Promise<BrandScopeAgent | null> {
  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("agents")
    .select("id, organization_id, member_type, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as BrandScopeAgent | null;
}

export async function getBrandInOrganization(brandId: string, organizationId: string) {
  const admin = createAdminClient("public");
  const { data, error } = await admin
    .from("cm_clients")
    .select("id, name, smarttalk_organization_id")
    .eq("id", brandId)
    .eq("smarttalk_organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getAgentBrandIds(agent: BrandScopeAgent) {
  if (agent.is_super_admin === true || !isBrandScopedMember(agent)) return null;

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("brand_advisor_assignments")
    .select("brand_id")
    .eq("organization_id", agent.organization_id)
    .eq("agent_id", agent.id);

  if (error) throw error;
  return (data || []).map((row) => row.brand_id as string);
}

export async function agentCanAccessBrand(
  agent: BrandScopeAgent,
  brandId: string
) {
  const brand = await getBrandInOrganization(brandId, agent.organization_id);
  if (!brand) return false;

  const assignedBrandIds = await getAgentBrandIds(agent);
  return !assignedBrandIds || assignedBrandIds.includes(brandId);
}

export async function getAccessibleConversation(
  agent: BrandScopeAgent,
  conversationId: string
) {
  const admin = createAdminClient("smarttalk");
  const assignedBrandIds = await getAgentBrandIds(agent);

  if (assignedBrandIds && assignedBrandIds.length === 0) return null;

  let query = admin
    .from("conversations")
    .select("id, organization_id, brand_id, channel_id, contact_id, channel_type, assigned_agent_id, status, contact:contacts(visibility_status)")
    .eq("id", conversationId)
    .eq("organization_id", agent.organization_id);

  if (assignedBrandIds) query = query.in("brand_id", assignedBrandIds);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}
