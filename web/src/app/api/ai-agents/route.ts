import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

// Sprint 22 hardening: 30 req/min por user en endpoints IA.
const AI_RATE_LIMIT = 30;
const AI_RATE_WINDOW_MS = 60 * 1000;

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

  // No usamos embed `knowledge_sources(*)`: la FK cruzada de esquemas no está
  // en el schema cache de PostgREST y hacía fallar TODO el listado con
  // "Could not find a relationship between 'ai_agents' and 'knowledge_sources'".
  // Traemos los agentes y adjuntamos sus fuentes en una consulta aparte.
  const { data: aiAgents, error } = await admin
    .from("ai_agents")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let agents = aiAgents || [];
  if (agents.length) {
    const { data: sources } = await admin
      .from("knowledge_sources")
      .select("*")
      .in("ai_agent_id", agents.map((a) => a.id));
    const byAgent: Record<string, unknown[]> = {};
    for (const s of sources || []) {
      const key = (s as { ai_agent_id?: string }).ai_agent_id;
      if (!key) continue;
      (byAgent[key] ||= []).push(s);
    }
    agents = agents.map((a) => ({ ...a, knowledge_sources: byAgent[a.id] || [] }));
  }

  return Response.json({ agents });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`ai-agents:${user.id}`, AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

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
  const { name, description, emoji, agent_type, system_prompt, actions, max_tokens, is_default, brand_id } = body;

  if (!name?.trim()) {
    return Response.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  // brand_id define a qué empresa pertenece el agente (modelo de agencia).
  // null = agente general (sin empresa). El predeterminado es POR empresa:
  // sólo se limpia el default dentro del mismo ámbito (misma marca, o los
  // agentes sin marca entre sí).
  const brandId: string | null = brand_id || null;
  if (is_default) {
    let unset = admin
      .from("ai_agents")
      .update({ is_default: false })
      .eq("organization_id", agent.organization_id);
    unset = brandId ? unset.eq("brand_id", brandId) : unset.is("brand_id", null);
    await unset;
  }

  const { data: aiAgent, error } = await admin
    .from("ai_agents")
    .insert({
      organization_id: agent.organization_id,
      brand_id: brandId,
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
