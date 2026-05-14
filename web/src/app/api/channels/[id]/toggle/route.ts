import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
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
    return Response.json({ error: "Solo los administradores pueden cambiar el estado de los canales" }, { status: 403 });
  }

  // Verify channel belongs to same org
  const { data: channel } = await admin
    .from("channels")
    .select("*")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!channel) {
    return Response.json({ error: "Canal no encontrado" }, { status: 404 });
  }

  const newStatus = channel.status === "active" ? "disconnected" : "active";

  const { data: updated, error } = await admin
    .from("channels")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ channel: updated });
}
