import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
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

  const { data: segment } = await admin
    .from("contact_segments")
    .select("*")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!segment) return Response.json({ error: "Segmento no encontrado" }, { status: 404 });

  const conditions = segment.conditions as { field: string; operator: string; value: string }[];

  let query = admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", agent.organization_id);

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

  // Update the stored count
  await admin
    .from("contact_segments")
    .update({ contact_count: count ?? 0 })
    .eq("id", id);

  return Response.json({ count: count ?? 0 });
}
