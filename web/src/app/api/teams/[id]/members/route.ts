import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    return Response.json({ error: "Only admins can manage team members" }, { status: 403 });
  }

  const { data: team } = await admin
    .from("teams")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });

  const { agent_id } = (await request.json()) as { agent_id: string };
  if (!agent_id) {
    return Response.json({ error: "agent_id is required" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("agent_teams")
    .select("id")
    .eq("team_id", id)
    .eq("agent_id", agent_id)
    .single();

  if (existing) {
    return Response.json({ error: "Agent is already a member of this team" }, { status: 409 });
  }

  const { data: member, error } = await admin
    .from("agent_teams")
    .insert({ team_id: id, agent_id })
    .select("*, agent:agents(id, name, email, role, status)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ member }, { status: 201 });
}

export async function DELETE(
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
    return Response.json({ error: "Only admins can manage team members" }, { status: 403 });
  }

  const { data: team } = await admin
    .from("teams")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });

  const { agent_id } = (await request.json()) as { agent_id: string };
  if (!agent_id) {
    return Response.json({ error: "agent_id is required" }, { status: 400 });
  }

  const { error } = await admin
    .from("agent_teams")
    .delete()
    .eq("team_id", id)
    .eq("agent_id", agent_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
