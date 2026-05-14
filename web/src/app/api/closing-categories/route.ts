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

  const { data: categories, error } = await admin
    .from("closing_categories")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("name");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ categories });
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
    return Response.json({ error: "Only admins can create closing categories" }, { status: 403 });
  }

  const { name } = (await request.json()) as { name: string };

  if (!name?.trim()) {
    return Response.json({ error: "Category name is required" }, { status: 400 });
  }

  const { data: category, error } = await admin
    .from("closing_categories")
    .insert({
      organization_id: agent.organization_id,
      name: name.trim(),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ category }, { status: 201 });
}
