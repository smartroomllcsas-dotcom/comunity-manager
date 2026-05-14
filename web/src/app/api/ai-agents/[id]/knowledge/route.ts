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

  // Verify AI agent belongs to org
  const { data: aiAgent } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!aiAgent) return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });

  const { data: sources, error } = await admin
    .from("knowledge_sources")
    .select("*")
    .eq("ai_agent_id", id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ sources: sources || [] });
}

export async function POST(
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
    return Response.json({ error: "Solo los administradores pueden agregar fuentes" }, { status: 403 });
  }

  const { data: aiAgent } = await admin
    .from("ai_agents")
    .select("id, organization_id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!aiAgent) return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });

  const { type, name, content, url } = await request.json();

  if (!type || !name?.trim()) {
    return Response.json({ error: "Tipo y nombre son requeridos" }, { status: 400 });
  }

  if (type === "text" && !content?.trim()) {
    return Response.json({ error: "El contenido es requerido para fuentes de texto" }, { status: 400 });
  }

  if (type === "url" && !url?.trim()) {
    return Response.json({ error: "La URL es requerida para fuentes de URL" }, { status: 400 });
  }

  const { data: source, error } = await admin
    .from("knowledge_sources")
    .insert({
      organization_id: agent.organization_id,
      ai_agent_id: id,
      ai_config_id: null,
      type,
      name: name.trim(),
      content: type === "text" ? content.trim() : null,
      url: type === "url" ? url.trim() : null,
      status: "active",
      metadata: {},
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ source }, { status: 201 });
}
