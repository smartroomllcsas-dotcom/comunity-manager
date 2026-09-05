/**
 * GET /api/whatsapp/cloud/lead-settings?clientId=<uuid>
 *   → { settings, templates } — settings de automatización de leads de la
 *     marca + plantillas de la marca para los pickers.
 *
 * PUT /api/whatsapp/cloud/lead-settings
 *   body: { clientId, enabled?, first_touch_template_id?, reengage_template_id?,
 *           reengage_after_hours?, agent_context?, booking_url?, max_sends_per_hour? }
 *   → upsert. Las plantillas referenciadas deben pertenecer a la marca.
 *
 * Multi-tenant: getCmClientAccess() — mismo rail que el resto de rutas cloud.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { AGENT_ROLES, AGENT_TONES, AGENT_GOALS } from "@/lib/whatsapp/cloud/agent-presets";

const roleValues = AGENT_ROLES.map((o) => o.value) as [string, ...string[]];
const toneValues = AGENT_TONES.map((o) => o.value) as [string, ...string[]];
const goalValues = AGENT_GOALS.map((o) => o.value) as [string, ...string[]];

const putSchema = z.object({
  clientId: z.string().uuid(),
  enabled: z.boolean().optional(),
  first_touch_template_id: z.string().uuid().nullable().optional(),
  reengage_template_id: z.string().uuid().nullable().optional(),
  reengage_after_hours: z.number().int().min(1).max(168).optional(),
  agent_role: z.enum(roleValues).nullable().optional(),
  agent_tone: z.enum(toneValues).nullable().optional(),
  agent_goal: z.enum(goalValues).nullable().optional(),
  agent_context: z.string().max(8000).nullable().optional(),
  booking_url: z.string().url().max(500).nullable().optional(),
  max_sends_per_hour: z.number().int().min(1).max(500).optional(),
  response_delay_seconds: z.number().int().min(0).max(300).optional(),
});

async function loadPayload(clientId: string) {
  const [{ data: settings }, { data: templates }] = await Promise.all([
    supabaseAdmin
      .from("cm_lead_agent_settings")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabaseAdmin
      .from("cm_wa_templates")
      .select("id, name, language, status, tag, category")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);
  return { settings: settings ?? null, templates: templates ?? [] };
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });

  return NextResponse.json(await loadPayload(access.clientId));
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { clientId, ...fields } = parsed.data;

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });

  // Las plantillas elegidas deben ser de ESTA marca (respeto de portafolio).
  for (const key of ["first_touch_template_id", "reengage_template_id"] as const) {
    const templateId = fields[key];
    if (templateId) {
      const { data: tpl } = await supabaseAdmin
        .from("cm_wa_templates")
        .select("id")
        .eq("id", templateId)
        .eq("client_id", access.clientId)
        .maybeSingle();
      if (!tpl) {
        return NextResponse.json(
          { error: `La plantilla de ${key === "first_touch_template_id" ? "primer contacto" : "retoma"} no pertenece a esta marca` },
          { status: 422 }
        );
      }
    }
  }

  const { error } = await supabaseAdmin
    .from("cm_lead_agent_settings")
    .upsert(
      { client_id: access.clientId, ...fields },
      { onConflict: "client_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await loadPayload(access.clientId));
}
