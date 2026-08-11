/**
 * GET /api/inbox/brands — marcas que el usuario puede ver en el Inbox.
 *
 * Alimenta el filtro «Marca» y las etiquetas de canal, conversación y chat.
 *
 * El alcance lo decide **el backend**, no la interfaz:
 *
 *   - `agency_user` y super admin  → todas las marcas de su organización.
 *   - `brand_admin` / `brand_advisor` → sólo las de
 *     `brand_advisor_assignments`, vía `getAgentBrandIds()`.
 *   - Sin asignaciones → lista vacía, que en el Inbox se traduce en cero leads.
 *
 * Devuelve exclusivamente `id` y `name`: `cm_clients` tiene más columnas y
 * ninguna otra hace falta para pintar una etiqueta.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const admin = createAdminClient("smarttalk");
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const assignedBrandIds = await getAgentBrandIds(agent);

  // Un miembro con alcance por marca y sin asignaciones no ve ninguna. Se
  // devuelve la lista vacía sin consultar el catálogo.
  if (assignedBrandIds && assignedBrandIds.length === 0) {
    return NextResponse.json({ brands: [] });
  }

  const publicAdmin = createAdminClient("public");
  let query = publicAdmin
    .from("cm_clients")
    .select("id, name")
    .eq("smarttalk_organization_id", agent.organization_id)
    .order("name", { ascending: true });

  // `assignedBrandIds` nulo significa "sin restricción por marca": la consulta
  // ya está acotada a la organización del agente.
  if (assignedBrandIds) {
    query = query.in("id", assignedBrandIds);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brands: data ?? [] });
}
