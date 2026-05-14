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

  const { data: segments, error } = await admin
    .from("contact_segments")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ segments: segments || [] });
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

  const { name, conditions } = await request.json();

  if (!name?.trim()) {
    return Response.json({ error: "El nombre del segmento es requerido" }, { status: 400 });
  }

  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return Response.json({ error: "Al menos una condicion es requerida" }, { status: 400 });
  }

  // Count matching contacts
  const count = await countMatchingContacts(admin, agent.organization_id, conditions);

  const { data: segment, error } = await admin
    .from("contact_segments")
    .insert({
      organization_id: agent.organization_id,
      name: name.trim(),
      conditions,
      contact_count: count,
      created_by: agent.id,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ segment }, { status: 201 });
}

interface SegmentCondition {
  field: string;
  operator: string;
  value: string;
}

async function countMatchingContacts(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  conditions: SegmentCondition[]
): Promise<number> {
  let query = admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  for (const condition of conditions) {
    const { field, operator, value } = condition;

    if (field === "name") {
      switch (operator) {
        case "es": query = query.eq("name", value); break;
        case "no_es": query = query.neq("name", value); break;
        case "contiene": query = query.ilike("name", `%${value}%`); break;
        case "no_contiene": query = query.not("name", "ilike", `%${value}%`); break;
        case "definido": query = query.not("name", "is", null); break;
        case "no_definido": query = query.is("name", null); break;
      }
    } else if (field === "wa_id") {
      switch (operator) {
        case "es": query = query.eq("wa_id", value); break;
        case "contiene": query = query.ilike("wa_id", `%${value}%`); break;
      }
    } else if (field === "tags") {
      switch (operator) {
        case "contiene": query = query.contains("tags", [value]); break;
        case "no_contiene": query = query.not("tags", "cs", `{${value}}`); break;
      }
    } else if (field === "lifecycle_stage_id") {
      switch (operator) {
        case "es": query = query.eq("lifecycle_stage_id", value); break;
        case "no_es": query = query.neq("lifecycle_stage_id", value); break;
        case "definido": query = query.not("lifecycle_stage_id", "is", null); break;
        case "no_definido": query = query.is("lifecycle_stage_id", null); break;
      }
    } else {
      // Custom fields stored in custom_fields jsonb
      switch (operator) {
        case "es": query = query.eq(`custom_fields->${field}`, value); break;
        case "no_es": query = query.neq(`custom_fields->${field}`, value); break;
        case "contiene": query = query.ilike(`custom_fields->>${field}`, `%${value}%`); break;
        case "definido": query = query.not(`custom_fields->>${field}`, "is", null); break;
        case "no_definido": query = query.is(`custom_fields->>${field}`, null); break;
      }
    }
  }

  const { count } = await query;
  return count ?? 0;
}
