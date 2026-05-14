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

  const { data: stages, error } = await admin
    .from("lifecycle_stages")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("position");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ stages });
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
    return Response.json({ error: "Only admins can create lifecycle stages" }, { status: 403 });
  }

  const { name, color, type, is_default } = (await request.json()) as {
    name: string;
    color: string;
    type: "primary" | "lost";
    is_default?: boolean;
  };

  if (!name?.trim()) {
    return Response.json({ error: "Stage name is required" }, { status: 400 });
  }

  if (!["primary", "lost"].includes(type)) {
    return Response.json({ error: "Type must be primary or lost" }, { status: 400 });
  }

  // Get max position for this type
  const { data: existing } = await admin
    .from("lifecycle_stages")
    .select("position")
    .eq("organization_id", agent.organization_id)
    .eq("type", type)
    .order("position", { ascending: false })
    .limit(1);

  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  // If marking as default, unset other defaults first
  if (is_default) {
    await admin
      .from("lifecycle_stages")
      .update({ is_default: false })
      .eq("organization_id", agent.organization_id);
  }

  const { data: stage, error } = await admin
    .from("lifecycle_stages")
    .insert({
      organization_id: agent.organization_id,
      name: name.trim(),
      color: color || "#3b82f6",
      type,
      position,
      is_default: is_default || false,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ stage }, { status: 201 });
}
