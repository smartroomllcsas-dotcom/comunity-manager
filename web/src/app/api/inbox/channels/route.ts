import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient("smarttalk");
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id, member_type")
    .eq("id", user.id)
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Whitelist: nunca devolver access_token, page_access_token ni webhook_verify_token al cliente.
  const CHANNEL_PUBLIC_COLUMNS =
    "id, organization_id, brand_id, type, name, status, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_phone_number, facebook_app_id, meta_business_id, config, connected_at, last_active_at, token_expires_at, created_at, updated_at";

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && assignedBrandIds.length === 0) {
    return NextResponse.json({ channels: [] });
  }

  let query = admin
    .from("channels")
    .select(CHANNEL_PUBLIC_COLUMNS)
    .eq("organization_id", agent.organization_id)
    .order("created_at", { ascending: false });

  if (assignedBrandIds) {
    query = query.in("brand_id", assignedBrandIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channels: data ?? [] });
}
