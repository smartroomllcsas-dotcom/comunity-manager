import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

// Sprint 22 hardening: 30 req/min por user en endpoints IA.
const AI_RATE_LIMIT = 30;
const AI_RATE_WINDOW_MS = 60 * 1000;

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    return Response.json({ error: "Solo los administradores pueden cambiar el estado" }, { status: 403 });
  }

  const { data: aiAgent } = await admin
    .from("ai_agents")
    .select("*")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!aiAgent) {
    return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });
  }

  const { data: updated, error } = await admin
    .from("ai_agents")
    .update({
      is_active: !aiAgent.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ agent: updated });
}
