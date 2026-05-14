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
    return Response.json({ error: "Only admins can change roles" }, { status: 403 });
  }

  // Can't change own role
  if (id === agent.id) {
    return Response.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const { role } = (await request.json()) as { role: string };

  if (!["admin", "supervisor", "agent"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  // Verify target agent belongs to same org
  const { data: targetAgent } = await admin
    .from("agents")
    .select("*")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!targetAgent) {
    return Response.json({ error: "Agent not found in your organization" }, { status: 404 });
  }

  const { error } = await admin
    .from("agents")
    .update({ role })
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
