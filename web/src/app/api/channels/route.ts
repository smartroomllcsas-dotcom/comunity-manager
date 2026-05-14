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

  const { data: channels, error } = await admin
    .from("channels")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ channels });
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
    return Response.json({ error: "Solo los administradores pueden crear canales" }, { status: 403 });
  }

  const body = await request.json();
  const { type, name, config } = body as {
    type: string;
    name: string;
    config?: Record<string, unknown>;
  };

  if (!type || !name) {
    return Response.json({ error: "type y name son requeridos" }, { status: 400 });
  }

  const { data: channel, error } = await admin
    .from("channels")
    .insert({
      organization_id: agent.organization_id,
      type,
      name,
      status: "pending",
      config: config || {},
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ channel }, { status: 201 });
}
