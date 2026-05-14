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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifySuperAdmin();
  if (!admin) return Response.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const supabase = createAdminClient();

  // Only allow specific fields to be updated
  const allowed: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") allowed.is_active = body.is_active;
  if (body.plan_id) allowed.plan_id = body.plan_id;
  if (body.name) allowed.name = body.name;

  if (Object.keys(allowed).length === 0) {
    return Response.json({ error: "Sin campos validos" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("organizations")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifySuperAdmin();
  if (!admin) return Response.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deleted: true });
}
