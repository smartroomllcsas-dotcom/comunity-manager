import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
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

  const segmentId = request.nextUrl.searchParams.get("segment_id");

  let contactIds: string[] | null = null;

  // If segment_id is provided, first get the segment conditions and filter
  if (segmentId) {
    const { data: segment } = await admin
      .from("contact_segments")
      .select("conditions")
      .eq("id", segmentId)
      .eq("organization_id", agent.organization_id)
      .single();

    if (segment) {
      const conditions = segment.conditions as { field: string; operator: string; value: string }[];
      let query = admin
        .from("contacts")
        .select("id")
        .eq("organization_id", agent.organization_id);

      for (const condition of conditions) {
        const { field, operator, value } = condition;
        if (field === "name") {
          switch (operator) {
            case "es": query = query.eq("name", value); break;
            case "no_es": query = query.neq("name", value); break;
            case "contiene": query = query.ilike("name", `%${value}%`); break;
          }
        } else if (field === "tags") {
          switch (operator) {
            case "contiene": query = query.contains("tags", [value]); break;
          }
        } else if (field === "lifecycle_stage_id") {
          switch (operator) {
            case "es": query = query.eq("lifecycle_stage_id", value); break;
          }
        }
      }

      const { data: filtered } = await query;
      if (filtered) contactIds = filtered.map((c) => c.id);
    }
  }

  // Fetch contacts
  let contactsQuery = admin
    .from("contacts")
    .select("*, lifecycle_stage:lifecycle_stages(*)")
    .eq("organization_id", agent.organization_id)
    .order("created_at", { ascending: false });

  if (contactIds !== null) {
    contactsQuery = contactsQuery.in("id", contactIds);
  }

  const { data: contacts, error } = await contactsQuery;

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Build CSV
  const headers = ["Nombre", "Telefono", "Email", "Etiquetas", "Ciclo de Vida", "Fecha Creacion"];
  const rows = (contacts || []).map((c) => [
    escapeCsvField(c.name || ""),
    escapeCsvField(c.wa_id || ""),
    escapeCsvField(c.custom_fields?.email || ""),
    escapeCsvField((c.tags || []).join(", ")),
    escapeCsvField(c.lifecycle_stage?.name || ""),
    escapeCsvField(c.created_at ? new Date(c.created_at).toLocaleDateString("es-CO") : ""),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contactos_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
