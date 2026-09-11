/**
 * Seguimiento automático de UN contacto (por empresa).
 *
 * GET   → estado actual: si está activo, detenido o marcado "no contactar",
 *         en qué intento va y cuántos tiene configurados su empresa.
 * PATCH → { action: "stop" | "resume" | "do_not_contact" | "allow_contact", note? }
 *         "stop"            → el cliente ya lo atendió un asesor: no más intentos
 *                             automáticos (el lead NO pasa a Perdido).
 *         "do_not_contact"  → pidió no ser contactado: fuera de seguimiento,
 *                             difusiones y sincronización, y pasa a Perdido.
 *         "resume" / "allow_contact" → revierte cada uno de los anteriores.
 *
 * Cada acción deja una nota interna en el chat, firmada por quien la hizo.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { getFollowupSettings } from "@/lib/whatsapp/cloud/followup";

type ContactRow = {
  id: string;
  name: string | null;
  brand_id: string | null;
  organization_id: string;
  lifecycle_stage_id: string | null;
  custom_fields: Record<string, unknown> | null;
};

async function authorize(request: NextRequest, contactId: string) {
  const supabase = await createClient();
  const admin = createAdminClient("smarttalk");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, role, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };

  const { data: contact } = await admin
    .from("contacts")
    .select("id, name, brand_id, organization_id, lifecycle_stage_id, custom_fields")
    .eq("id", contactId)
    .eq("organization_id", agent.organization_id)
    .maybeSingle();
  if (!contact) return { error: NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 }) };

  const assignedBrandIds = agent.is_super_admin ? null : await getAgentBrandIds(agent);
  if (assignedBrandIds && contact.brand_id && !assignedBrandIds.includes(contact.brand_id)) {
    return { error: NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 }) };
  }
  return { admin, agent, contact: contact as ContactRow };
}

async function latestConversationId(admin: ReturnType<typeof createAdminClient>, contactId: string) {
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) || null;
}

function stateOf(cf: Record<string, unknown>): "stopped" | "do_not_contact" | "active" {
  if (cf.do_not_contact === true) return "do_not_contact";
  if (cf.wa_followup_stopped === true) return "stopped";
  return "active";
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize(request, id);
  if ("error" in auth) return auth.error;
  const { admin, contact } = auth;
  const cf = contact.custom_fields || {};

  const settings = contact.brand_id ? await getFollowupSettings(contact.brand_id) : null;
  const { data: stage } = contact.lifecycle_stage_id
    ? await admin.from("lifecycle_stages").select("name").eq("id", contact.lifecycle_stage_id).maybeSingle()
    : { data: null };

  return NextResponse.json({
    state: stateOf(cf),
    stage: (stage?.name as string | undefined) || null,
    attemptsDone: Number(cf.wa_followup_step ?? (cf.wa_reengaged_at ? 1 : 0)) || 0,
    attemptsTotal: settings?.steps.length ?? 0,
    followupEnabled: settings?.enabled ?? false,
    lastAttemptAt: (cf.wa_followup_last_at as string | undefined) || (cf.wa_reengaged_at as string | undefined) || null,
    hasMeeting: cf.cita_estado === "agendada",
    reason: (cf.wa_followup_stopped_reason as string | undefined) || (cf.do_not_contact_reason as string | undefined) || null,
  });
}

const patchSchema = z.object({
  action: z.enum(["stop", "resume", "do_not_contact", "allow_contact"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  const { action, note } = parsed.data;

  const auth = await authorize(request, id);
  if ("error" in auth) return auth.error;
  const { admin, agent, contact } = auth;
  const cf = { ...((contact.custom_fields as Record<string, unknown> | null) || {}) };
  const now = new Date().toISOString();
  const conversationId = await latestConversationId(admin, contact.id);

  let noteText = "";
  const update: Record<string, unknown> = {};

  if (action === "stop") {
    cf.wa_followup_stopped = true;
    cf.wa_followup_stopped_at = now;
    if (note?.trim()) cf.wa_followup_stopped_reason = note.trim().slice(0, 300);
    update.custom_fields = cf;
    noteText = `Seguimiento automático detenido${note?.trim() ? `: ${note.trim()}` : ". Este cliente lo atiende un asesor."}`;
  } else if (action === "resume") {
    delete cf.wa_followup_stopped;
    delete cf.wa_followup_stopped_at;
    delete cf.wa_followup_stopped_reason;
    update.custom_fields = cf;
    noteText = "Seguimiento automático reanudado.";
  } else if (action === "do_not_contact") {
    const { markDoNotContact } = await import("@/lib/smarttalk/do-not-contact");
    await markDoNotContact(admin, {
      contactId: contact.id,
      organizationId: contact.organization_id,
      conversationId,
      reason: note?.trim() || "marcado por un asesor desde la ficha",
    });
    return NextResponse.json({ ok: true, state: "do_not_contact" });
  } else {
    // allow_contact: revierte "no contactar" (la etapa se cambia a mano si aplica)
    delete cf.do_not_contact;
    delete cf.do_not_contact_at;
    delete cf.do_not_contact_reason;
    delete cf.wa_followup_stopped;
    update.custom_fields = cf;
    noteText = "Se permite contactar de nuevo a este cliente.";
  }

  const { error } = await admin.from("contacts").update(update).eq("id", contact.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (conversationId) {
    try {
      const { addSystemNote } = await import("@/lib/smarttalk/internal-notes");
      await addSystemNote({
        conversationId,
        organizationId: contact.organization_id,
        agentId: agent.id as string,
        content: noteText,
      });
    } catch {
      // la nota es complementaria; la acción ya quedó guardada
    }
  }

  return NextResponse.json({ ok: true, state: stateOf(cf) });
}
