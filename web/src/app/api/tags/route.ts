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

  const { data: tags, error } = await admin
    .from("tags")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("name");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Count usage per tag by checking contacts with matching tag names
  const { data: contacts } = await admin
    .from("contacts")
    .select("tags")
    .eq("organization_id", agent.organization_id);

  const usageMap: Record<string, number> = {};
  if (contacts) {
    for (const contact of contacts) {
      if (Array.isArray(contact.tags)) {
        for (const t of contact.tags) {
          usageMap[t] = (usageMap[t] || 0) + 1;
        }
      }
    }
  }

  const tagsWithUsage = (tags || []).map((tag) => ({
    ...tag,
    usage_count: usageMap[tag.name] || 0,
  }));

  return Response.json({ tags: tagsWithUsage });
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
    return Response.json({ error: "Only admins can create tags" }, { status: 403 });
  }

  const { name, color } = (await request.json()) as { name: string; color: string };

  if (!name?.trim()) {
    return Response.json({ error: "Tag name is required" }, { status: 400 });
  }

  const { data: tag, error } = await admin
    .from("tags")
    .insert({
      organization_id: agent.organization_id,
      name: name.trim(),
      color: color || "#3b82f6",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ tag }, { status: 201 });
}
