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

  const { data: invitations, error } = await admin
    .from("invitations")
    .select("*, inviter:agents!invited_by(name, email)")
    .eq("organization_id", agent.organization_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ invitations });
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
    return Response.json({ error: "Only admins can invite team members" }, { status: 403 });
  }

  const { email, role } = (await request.json()) as { email: string; role: string };

  if (!email || !role) {
    return Response.json({ error: "Email and role are required" }, { status: 400 });
  }

  if (!["admin", "supervisor", "agent"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check if agent with this email already exists in the org
  const { data: existing } = await admin
    .from("agents")
    .select("id")
    .eq("organization_id", agent.organization_id)
    .eq("email", email)
    .single();

  if (existing) {
    return Response.json({ error: "This email already belongs to a team member" }, { status: 409 });
  }

  // Check if there's already a pending invitation
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id")
    .eq("organization_id", agent.organization_id)
    .eq("email", email)
    .eq("status", "pending")
    .single();

  if (existingInvite) {
    return Response.json({ error: "There is already a pending invitation for this email" }, { status: 409 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: invitation, error } = await admin
    .from("invitations")
    .insert({
      organization_id: agent.organization_id,
      email,
      role,
      invited_by: agent.id,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ invitation }, { status: 201 });
}
