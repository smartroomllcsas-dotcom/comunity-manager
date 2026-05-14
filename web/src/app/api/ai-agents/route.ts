import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
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

  const { data: aiAgents, error } = await admin
    .from("ai_agents")
    .select("*, knowledge_sources(*)")
    .eq("organization_id", agent.organization_id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ agents: aiAgents || [] });
}

export async function POST(request: NextRequest) {
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
    return Response.json({ error: "Solo los administradores pueden crear agentes IA" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, emoji, agent_type, system_prompt, actions, max_tokens, is_default } = body;

  if (!name?.trim()) {
    return Response.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  // If setting as default, unset other defaults
  if (is_default) {
    await admin
      .from("ai_agents")
      .update({ is_default: false })
      .eq("organization_id", agent.organization_id);
  }

  const { data: aiAgent, error } = await admin
    .from("ai_agents")
    .insert({
      organization_id: agent.organization_id,
      name: name.trim(),
      description: description || null,
      emoji: emoji || "🤖",
      agent_type: agent_type || "custom",
      system_prompt: system_prompt || "",
      actions: actions || [],
      max_tokens: max_tokens || 1024,
      is_active: false,
      is_default: is_default || false,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ agent: aiAgent }, { status: 201 });
}
