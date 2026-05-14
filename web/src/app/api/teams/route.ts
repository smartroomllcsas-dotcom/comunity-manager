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

  const { data: teams, error } = await admin
    .from("teams")
    .select("*, members:agent_teams(*, agent:agents(id, name, email, role, status))")
    .eq("organization_id", agent.organization_id)
    .order("name");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ teams });
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
    return Response.json({ error: "Only admins can create teams" }, { status: 403 });
  }

  const { name, description, member_ids } = (await request.json()) as {
    name: string;
    description?: string;
    member_ids?: string[];
  };

  if (!name?.trim()) {
    return Response.json({ error: "Team name is required" }, { status: 400 });
  }

  const { data: team, error } = await admin
    .from("teams")
    .insert({
      organization_id: agent.organization_id,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (member_ids && member_ids.length > 0) {
    const memberRows = member_ids.map((agent_id) => ({
      team_id: team.id,
      agent_id,
    }));
    await admin.from("agent_teams").insert(memberRows);
  }

  return Response.json({ team }, { status: 201 });
}
