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
    return Response.json({ error: "Solo administradores pueden reordenar campos" }, { status: 403 });
  }

  const { fields } = (await request.json()) as {
    fields: { id: string; position: number }[];
  };

  if (!fields || !Array.isArray(fields)) {
    return Response.json({ error: "fields array is required" }, { status: 400 });
  }

  const updates = fields.map(({ id, position }) =>
    admin
      .from("contact_field_definitions")
      .update({ position })
      .eq("id", id)
      .eq("organization_id", agent.organization_id)
  );

  await Promise.all(updates);

  return Response.json({ success: true });
}
