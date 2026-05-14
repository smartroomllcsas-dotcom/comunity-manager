import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
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

  const { data: aiAgent, error } = await admin
    .from("ai_agents")
    .select("*, knowledge_sources(*)")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (error || !aiAgent) {
    return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });
  }

  return Response.json({ agent: aiAgent });
}

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
    return Response.json({ error: "Solo los administradores pueden editar agentes IA" }, { status: 403 });
  }

  // Verify ownership
  const { data: existing } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!existing) return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.emoji !== undefined) updates.emoji = body.emoji;
  if (body.agent_type !== undefined) updates.agent_type = body.agent_type;
  if (body.system_prompt !== undefined) updates.system_prompt = body.system_prompt;
  if (body.actions !== undefined) updates.actions = body.actions;
  if (body.max_tokens !== undefined) updates.max_tokens = body.max_tokens;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  if (body.is_default !== undefined) {
    updates.is_default = body.is_default;
    if (body.is_default) {
      await admin
        .from("ai_agents")
        .update({ is_default: false })
        .eq("organization_id", agent.organization_id)
        .neq("id", id);
    }
  }

  const { data: aiAgent, error } = await admin
    .from("ai_agents")
    .update(updates)
    .eq("id", id)
    .select("*, knowledge_sources(*)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ agent: aiAgent });
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
    return Response.json({ error: "Solo los administradores pueden eliminar agentes IA" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!existing) return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });

  // Delete knowledge sources first
  await admin.from("knowledge_sources").delete().eq("ai_agent_id", id);

  const { error } = await admin.from("ai_agents").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
