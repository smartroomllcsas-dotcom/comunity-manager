import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  if (agent.role !== "admin") {
    return Response.json({ error: "Only admins can update lifecycle stages" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("lifecycle_stages")
    .select("*")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!existing) return Response.json({ error: "Stage not found" }, { status: 404 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.color !== undefined) updates.color = body.color;
  if (body.type !== undefined) updates.type = body.type;

  if (body.is_default === true) {
    await admin
      .from("lifecycle_stages")
      .update({ is_default: false })
      .eq("organization_id", agent.organization_id);
    updates.is_default = true;
  }

  const { data: stage, error } = await admin
    .from("lifecycle_stages")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ stage });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  if (agent.role !== "admin") {
    return Response.json({ error: "Only admins can delete lifecycle stages" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("lifecycle_stages")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!existing) return Response.json({ error: "Stage not found" }, { status: 404 });

  const { error } = await admin.from("lifecycle_stages").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
