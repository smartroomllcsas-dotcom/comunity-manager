import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifySuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: agent } = await supabase.from("agents").select("is_super_admin").eq("id", user.id).single();
  return agent?.is_super_admin === true;
}

export async function GET() {
  if (!(await verifySuperAdmin())) return Response.json({ error: "No autorizado" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("*, organization:organizations(name), plan:plans!subscriptions_plan_id_fkey(name)")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function PATCH(request: Request) {
  if (!(await verifySuperAdmin())) return Response.json({ error: "No autorizado" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id || !["trial", "active", "past_due", "cancelled", "suspended"].includes(status)) {
    return Response.json({ error: "Suscripción o estado inválido" }, { status: 400 });
  }
  const { error } = await createAdminClient().from("subscriptions").update({ status }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
