import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAgentBrandIds,
  getBrandInOrganization,
  getBrandScopeAgent,
} from "@/lib/smarttalk/brand-scope";

/**
 * Returns only a count. Restricted-contact identifiers and private fields must
 * never be exposed by the billing notice endpoint.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const agent = await getBrandScopeAgent(user.id);
  if (!agent?.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && assignedBrandIds.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const requestedBrandId = request.nextUrl.searchParams.get("brandId")?.trim();
  if (requestedBrandId) {
    const brand = await getBrandInOrganization(requestedBrandId, agent.organization_id);
    if (!brand || (assignedBrandIds && !assignedBrandIds.includes(requestedBrandId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const admin = createAdminClient("smarttalk");
  let query = admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", agent.organization_id)
    .eq("visibility_status", "restricted");

  if (requestedBrandId) {
    query = query.eq("brand_id", requestedBrandId);
  } else if (assignedBrandIds) {
    query = query.in("brand_id", assignedBrandIds);
  }

  const { count, error } = await query;
  if (error) {
    return NextResponse.json({ error: "No fue posible consultar los leads retenidos." }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
