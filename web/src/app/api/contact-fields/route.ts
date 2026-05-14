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

  const { data: fields, error } = await admin
    .from("contact_field_definitions")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("position");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ fields: fields || [] });
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
    return Response.json({ error: "Solo administradores pueden crear campos" }, { status: 403 });
  }

  const { name, type, options, description, visibility } = await request.json();

  if (!name?.trim()) {
    return Response.json({ error: "El nombre del campo es requerido" }, { status: 400 });
  }

  if (!type) {
    return Response.json({ error: "El tipo del campo es requerido" }, { status: 400 });
  }

  // Generate field_key from name
  const field_key = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  // Get the max position
  const { data: existing } = await admin
    .from("contact_field_definitions")
    .select("position")
    .eq("organization_id", agent.organization_id)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data: field, error } = await admin
    .from("contact_field_definitions")
    .insert({
      organization_id: agent.organization_id,
      name: name.trim(),
      field_key,
      type,
      options: options || [],
      description: description || null,
      visibility: visibility || "show_always",
      position: nextPosition,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ field }, { status: 201 });
}
