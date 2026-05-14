import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { id, sourceId } = await params;
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
    return Response.json({ error: "Solo los administradores pueden eliminar fuentes" }, { status: 403 });
  }

  // Verify AI agent belongs to org
  const { data: aiAgent } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!aiAgent) return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });

  const { error } = await admin
    .from("knowledge_sources")
    .delete()
    .eq("id", sourceId)
    .eq("ai_agent_id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
