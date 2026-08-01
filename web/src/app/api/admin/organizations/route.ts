import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifySuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: agent } = await supabase
    .from("agents")
    .select("id, is_super_admin")
    .eq("id", user.id)
    .single();
  if (!agent?.is_super_admin) return null;
  return agent;
}

export async function GET() {
  const admin = await verifySuperAdmin();
  if (!admin) return Response.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*, plan:plans!organizations_plan_id_fkey(name, price_monthly)")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const enriched = await Promise.all((data || []).map(async (org: any) => {
    const [agents, contacts, whatsapp] = await Promise.all([
      supabase.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("channels").select("id").eq("organization_id", org.id).eq("type", "whatsapp_cloud_api").eq("status", "active").limit(1),
    ]);
    return {
      ...org,
      _agents_count: agents.count ?? 0,
      _contacts_count: contacts.count ?? 0,
      _has_whatsapp: (whatsapp.data || []).length > 0,
    };
  }));
  return Response.json(enriched);
}
