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

export async function GET(request: NextRequest) {
  const admin = await verifySuperAdmin();
  if (!admin) return Response.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  let query = supabase
    .from("payments")
    .select("*, organization:organizations(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
