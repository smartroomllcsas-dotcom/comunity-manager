import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    return Response.json({ error: "Only admins can reorder lifecycle stages" }, { status: 403 });
  }

  const { stages } = (await request.json()) as {
    stages: { id: string; position: number }[];
  };

  if (!stages || !Array.isArray(stages)) {
    return Response.json({ error: "stages array is required" }, { status: 400 });
  }

  // Update each stage position
  const updates = stages.map(({ id, position }) =>
    admin
      .from("lifecycle_stages")
      .update({ position })
      .eq("id", id)
      .eq("organization_id", agent.organization_id)
  );

  await Promise.all(updates);

  return Response.json({ success: true });
}
