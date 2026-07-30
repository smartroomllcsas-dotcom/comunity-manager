import { createAdminClient } from "@/lib/supabase/admin";

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

export async function getAgentBrandIds(agent: {
  id: string;
  organization_id: string;
  member_type?: string | null;
}) {
  if (agent.member_type !== "brand_advisor") return null;

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("brand_advisor_assignments")
    .select("brand_id")
    .eq("organization_id", agent.organization_id)
    .eq("agent_id", agent.id);

  if (error) throw error;
  return (data || []).map((row) => row.brand_id as string);
}
