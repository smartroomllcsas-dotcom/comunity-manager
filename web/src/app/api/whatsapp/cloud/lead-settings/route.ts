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
import {
  CHANNEL_INSTRUCTION_MAX,
  getChannelInstructions,
  setChannelInstructions,
} from "@/lib/whatsapp/cloud/channel-instructions";
import { getFixedReplies, setFixedReplies } from "@/lib/whatsapp/cloud/fixed-replies";
import {
  REMINDER_TEMPLATE_NAME,
  ensureReminderTemplate,
  getBookingReminderSettings,
  setBookingReminderSettings,
} from "@/lib/whatsapp/cloud/booking-reminder";

const roleValues = AGENT_ROLES.map((o) => o.value) as [string, ...string[]];
const toneValues = AGENT_TONES.map((o) => o.value) as [string, ...string[]];
const goalValues = AGENT_GOALS.map((o) => o.value) as [string, ...string[]];

const fixedReplySchema = z.object({
  match: z.string().min(1).max(500),
  reply: z.string().min(1).max(4000),
  unless: z.string().max(500).optional(),
  once: z.boolean().optional(),
});

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
  // Instrucciones del agente por canal (misma empresa, distinto tono/oferta).
  channel_instructions: z
    .object({
      whatsapp: z.string().max(CHANNEL_INSTRUCTION_MAX).nullable().optional(),
      instagram: z.string().max(CHANNEL_INSTRUCTION_MAX).nullable().optional(),
      messenger: z.string().max(CHANNEL_INSTRUCTION_MAX).nullable().optional(),
    })
    .optional(),
  // Respuestas exactas por canal: si el mensaje del cliente coincide con el
  // patrón, se envía el texto tal cual (sin IA).
  fixed_replies: z
    .object({
      whatsapp: z.array(fixedReplySchema).max(20).optional(),
      instagram: z.array(fixedReplySchema).max(20).optional(),
      messenger: z.array(fixedReplySchema).max(20).optional(),
    })
    .optional(),
  // Recordatorio de reunión (N minutos antes de la cita agendada en Cal.com).
  booking_reminder: z
    .object({
      enabled: z.boolean().optional(),
      template_id: z.string().uuid().nullable().optional(),
      minutes_before: z.number().int().min(5).max(1440).optional(),
    })
    .optional(),
  /** Crear en Meta la plantilla de recordatorio si la marca no la tiene. */
  create_reminder_template: z.boolean().optional(),
});

async function loadPayload(clientId: string) {
  const [channel_instructions, booking_reminder, fixed_replies] = await Promise.all([
    getChannelInstructions(clientId),
    getBookingReminderSettings(clientId),
    getFixedReplies(clientId),
  ]);
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
  return {
    settings: settings
      ? { ...(settings as Record<string, unknown>), channel_instructions, booking_reminder, fixed_replies }
      : null,
    templates: templates ?? [],
  };
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
  const { clientId, channel_instructions, booking_reminder, fixed_replies, create_reminder_template, ...fields } =
    parsed.data;

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });

  if (channel_instructions !== undefined) {
    const saved = await setChannelInstructions(access.clientId, channel_instructions);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  if (fixed_replies !== undefined) {
    const saved = await setFixedReplies(access.clientId, fixed_replies);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  let reminderTemplateNotice: string | null = null;
  if (create_reminder_template) {
    const { data: brand } = await supabaseAdmin.from("cm_clients").select("name").eq("id", access.clientId).maybeSingle();
    const created = await ensureReminderTemplate(access.clientId, (brand?.name as string) || "nuestro equipo");
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
    reminderTemplateNotice = created.created
      ? `Plantilla "${REMINDER_TEMPLATE_NAME}" enviada a Meta para aprobación (estado ${created.status}).`
      : `La plantilla "${REMINDER_TEMPLATE_NAME}" ya existía (estado ${created.status}).`;
    // Se deja seleccionada como plantilla de recordatorio.
    const current = await getBookingReminderSettings(access.clientId);
    await setBookingReminderSettings(access.clientId, { ...current, template_id: created.id });
  }

  if (booking_reminder !== undefined) {
    const current = await getBookingReminderSettings(access.clientId);
    const merged = { ...current, ...booking_reminder };
    if (merged.template_id) {
      const { data: tpl } = await supabaseAdmin
        .from("cm_wa_templates")
        .select("id")
        .eq("id", merged.template_id)
        .eq("client_id", access.clientId)
        .maybeSingle();
      if (!tpl) return NextResponse.json({ error: "La plantilla de recordatorio no pertenece a esta marca" }, { status: 422 });
    }
    const saved = await setBookingReminderSettings(access.clientId, merged);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
  }

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

  return NextResponse.json({ ...(await loadPayload(access.clientId)), notice: reminderTemplateNotice });
}
