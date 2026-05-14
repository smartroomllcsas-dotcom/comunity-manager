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
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [orgsRes, agentsRes, contactsRes, subsRes, paymentsRes] = await Promise.all([
    supabase.from("organizations").select("id, is_active", { count: "exact" }),
    supabase.from("agents").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("status"),
    supabase
      .from("payments")
      .select("amount, status, created_at")
      .eq("status", "approved")
      .gte("created_at", monthStart),
  ]);

  const totalOrgs = orgsRes.count ?? 0;
  const activeOrgs = (orgsRes.data || []).filter((o: any) => o.is_active).length;
  const totalAgents = agentsRes.count ?? 0;
  const totalContacts = contactsRes.count ?? 0;
  const monthlyRevenue = (paymentsRes.data || []).reduce(
    (sum: number, p: any) => sum + (Number(p.amount) || 0),
    0
  );

  const subsByStatus: Record<string, number> = {};
  for (const s of subsRes.data || []) {
    subsByStatus[(s as any).status] = (subsByStatus[(s as any).status] || 0) + 1;
  }

  return Response.json({
    totalOrgs,
    activeOrgs,
    totalAgents,
    totalContacts,
    monthlyRevenue,
    subscriptionsByStatus: subsByStatus,
  });
}
