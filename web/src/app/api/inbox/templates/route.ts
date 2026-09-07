/**
 * GET /api/inbox/templates?brandId=<uuid>
 *   → { templates: InboxTemplate[] }
 *
 * Plantillas de WhatsApp APROBADAS que el asesor puede enviar desde el chat.
 * Fuente principal: `public.cm_wa_templates` (el sistema nuevo, sincronizado
 * con Meta, por marca). Se añaden las del sistema viejo
 * (`smarttalk.message_templates`) por compatibilidad. Antes el selector leía
 * sólo la tabla vieja desde el navegador y salía vacío aunque la marca
 * tuviera plantillas aprobadas.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient("smarttalk");
  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, member_type")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const brandId = request.nextUrl.searchParams.get("brandId");
  if (brandId) {
    const assigned = await getAgentBrandIds(agent);
    if (assigned && !assigned.includes(brandId)) {
      return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });
    }
  }

  const templates: Array<Record<string, unknown>> = [];

  if (brandId) {
    const pub = createAdminClient("public");
    const { data: cmTemplates } = await pub
      .from("cm_wa_templates")
      .select("id, name, language, category, components, parameter_format, whatsapp_account_id, status")
      .eq("client_id", brandId)
      .eq("status", "APPROVED")
      .order("name");
    for (const t of cmTemplates || []) {
      templates.push({
        id: t.id,
        organization_id: agent.organization_id,
        wa_template_id: null,
        name: t.name,
        language: t.language,
        category: String(t.category || "marketing").toLowerCase(),
        components: t.components || [],
        status: "approved",
        parameter_format: t.parameter_format || "POSITIONAL",
        whatsapp_account_id: t.whatsapp_account_id,
        channel_id: null,
        source: "cm",
      });
    }
  }

  const { data: legacy } = await admin
    .from("message_templates")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .eq("status", "approved")
    .order("name");
  for (const t of legacy || []) {
    templates.push({ ...(t as Record<string, unknown>), source: "legacy" });
  }

  return NextResponse.json({ templates });
}
