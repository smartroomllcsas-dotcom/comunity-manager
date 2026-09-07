/**
 * Leads de formulario (Facebook Lead Ads) que llegaron ANTES de configurar la
 * automatización y nunca recibieron la plantilla de primer contacto.
 *
 * GET  /api/whatsapp/cloud/lead-backfill?clientId=<uuid>
 *   → { leads: [...], unreachable: [...] }
 *     `leads`: contactos de la marca con source=facebook_lead_form cuyo
 *     custom_fields.wa_first_touch no es "enviado" y que vale la pena
 *     reintentar (nunca intentados, límite por hora, etc.).
 *     `unreachable`: WhatsApp ya dijo que no llega (número sin WhatsApp,
 *     Meta limitó marketing a ese número, inactivo 24 h, teléfono inválido).
 *     Reintentarlos gasta el cupo por hora y vuelve a fallar; los asesores ya
 *     recibieron el correo. Sólo se reintentan si se piden por id.
 *
 * POST /api/whatsapp/cloud/lead-backfill
 *   body: { clientId, contactIds?: string[] }   (sin contactIds = todos los reintentables,
 *          primero los que nunca se intentaron, del más antiguo al más nuevo)
 *   → { results: [{ id, name, sent, reason? }], sent, failed }
 *     Envía la plantilla de primer contacto configurada (misma lógica que el
 *     lead nuevo) y marca el contacto. Respeta el límite por hora de la marca.
 *
 * Multi-tenant: getCmClientAccess() — mismo rail que el resto de rutas cloud.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { sendFirstTouchTemplate } from "@/lib/whatsapp/cloud/lead-engagement";
import { notifyLeadNeedsManualContact } from "@/lib/smarttalk/lead-alerts";

export const maxDuration = 300;

const MAX_PER_REQUEST = 100;

type ContactRow = {
  id: string;
  name: string | null;
  wa_id: string | null;
  created_at: string;
  visibility_status: string | null;
  lifecycle_stage_id: string | null;
  organization_id: string | null;
  custom_fields: Record<string, unknown> | null;
};

type PendingLead = {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  reason: string | null;
  campaign: string | null;
  company: string | null;
};

function toPending(row: ContactRow): PendingLead {
  const cf = row.custom_fields || {};
  const phone =
    (typeof cf.phone === "string" && cf.phone) ||
    (typeof cf.phone_number === "string" && cf.phone_number) ||
    row.wa_id ||
    null;
  return {
    id: row.id,
    name: row.name,
    phone,
    created_at: row.created_at,
    reason: typeof cf.wa_first_touch === "string" ? cf.wa_first_touch : null,
    campaign: typeof cf.lead_campaign === "string" ? cf.lead_campaign : null,
    company: typeof cf.company_name === "string" ? cf.company_name : null,
  };
}

/**
 * Motivo que no cambia por reintentar (WhatsApp no entrega a ese número).
 * "Meta limitó marketing" sí puede cambiar cuando la marca tenga aprobada la
 * plantilla Utility de primer contacto: entonces vuelve a ser reintentable.
 */
export function isUnreachableReason(reason: string | null, utilityApproved: boolean): boolean {
  if (!reason) return false;
  if (reason === "no_enviado (invalid_phone)" || reason === "sin_telefono") return true;
  if (!reason.startsWith("fallido (")) return false;
  if (/limit[oó] los mensajes de marketing/i.test(reason)) return !utilityApproved;
  return true;
}

async function utilityFirstTouchApproved(brandId: string): Promise<boolean> {
  try {
    const { getFirstTouchUtilitySettings } = await import("@/lib/whatsapp/cloud/first-touch-utility");
    const utility = await getFirstTouchUtilitySettings(brandId);
    if (!utility.enabled || !utility.template_id) return false;
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { data } = await supabaseAdmin
      .from("cm_wa_templates")
      .select("status")
      .eq("id", utility.template_id)
      .maybeSingle();
    return String(data?.status || "").toUpperCase() === "APPROVED";
  } catch {
    return false;
  }
}

async function loadPending(brandId: string, contactIds?: string[]) {
  const admin = createAdminClient("smarttalk");
  let query = admin
    .from("contacts")
    .select("id, name, wa_id, created_at, visibility_status, lifecycle_stage_id, organization_id, custom_fields")
    .eq("brand_id", brandId)
    .eq("custom_fields->>source", "facebook_lead_form")
    .order("created_at", { ascending: false })
    .limit(500);
  if (contactIds?.length) query = query.in("id", contactIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rowsAll = (data || []) as ContactRow[];
  // "No contactar" (pidió no ser contactado o etapa Perdido): fuera sí o sí.
  const { isDoNotContact, stopStageIdsForOrg } = await import("@/lib/smarttalk/do-not-contact");
  const orgId = rowsAll.find((r) => r.organization_id)?.organization_id;
  const stopIds = orgId ? await stopStageIdsForOrg(admin, orgId) : new Set<string>();
  return rowsAll.filter((row) => {
    if (row.visibility_status === "restricted") return false;
    if (isDoNotContact(row, stopIds)) return false;
    const touch = row.custom_fields?.wa_first_touch;
    return touch !== "enviado";
  });
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });

  try {
    const [rows, utilityApproved] = await Promise.all([
      loadPending(access.clientId),
      utilityFirstTouchApproved(access.clientId),
    ]);
    const all = rows.map(toPending);
    const unreachable = all.filter((l) => isUnreachableReason(l.reason, utilityApproved) || !l.phone);
    const leads = all.filter((l) => !unreachable.includes(l));
    return NextResponse.json({ leads, unreachable });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const postSchema = z.object({
  clientId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()).max(MAX_PER_REQUEST).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { clientId, contactIds } = parsed.data;

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });

  let rows: ContactRow[];
  try {
    rows = await loadPending(access.clientId, contactIds);
    if (!contactIds?.length) {
      // "Sincronizar todos": sólo los reintentables. Antes se gastaba el cupo
      // por hora en números que WhatsApp ya había rechazado y los nunca
      // intentados (los más antiguos) no llegaban a su turno.
      const utilityApproved = await utilityFirstTouchApproved(access.clientId);
      rows = rows.filter((row) => {
        const lead = toPending(row);
        return lead.phone && !isUnreachableReason(lead.reason, utilityApproved);
      });
      rows.sort((a, b) => {
        const aTried = a.custom_fields?.wa_first_touch ? 1 : 0;
        const bTried = b.custom_fields?.wa_first_touch ? 1 : 0;
        if (aTried !== bTried) return aTried - bTried; // nunca intentados primero
        return a.created_at.localeCompare(b.created_at); // más antiguos primero
      });
    }
    rows = rows.slice(0, MAX_PER_REQUEST);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const admin = createAdminClient("smarttalk");
  const results: Array<{ id: string; name: string | null; sent: boolean; reason?: string }> = [];

  // Secuencial a propósito: respeta el límite por hora y no satura la API de
  // Meta. Si el límite se alcanza, los restantes quedan pendientes y se
  // reintentan en otra pasada.
  for (const row of rows) {
    const lead = toPending(row);
    if (!lead.phone) {
      results.push({ id: row.id, name: row.name, sent: false, reason: "sin_telefono" });
      await notifyLeadNeedsManualContact({ contactId: row.id, brandId: access.clientId, cause: "no_phone" });
      continue;
    }

    const cf = row.custom_fields || {};
    const outcome = await sendFirstTouchTemplate({
      clientId: access.clientId,
      phone: lead.phone,
      leadName: (typeof cf.full_name === "string" && cf.full_name) || row.name,
      topic: lead.campaign || (typeof cf.lead_form_id === "string" ? cf.lead_form_id : null),
    });

    const touchMeta: Record<string, string> = outcome.sent
      ? {
          wa_first_touch: "enviado",
          wa_first_touch_template: outcome.templateName,
          wa_first_touch_at: new Date().toISOString(),
          wa_first_touch_mode: "sincronizacion_manual",
        }
      : { wa_first_touch: `no_enviado (${outcome.reason})` };

    await admin
      .from("contacts")
      .update({ custom_fields: { ...cf, ...touchMeta } })
      .eq("id", row.id);

    results.push(
      outcome.sent
        ? { id: row.id, name: row.name, sent: true }
        : { id: row.id, name: row.name, sent: false, reason: outcome.reason }
    );
    if (!outcome.sent && outcome.reason === "invalid_phone") {
      await notifyLeadNeedsManualContact({ contactId: row.id, brandId: access.clientId, cause: "invalid_phone" });
    }

    if (!outcome.sent && outcome.reason === "rate_limited") break;
  }

  const sent = results.filter((r) => r.sent).length;
  return NextResponse.json({ results, sent, failed: results.length - sent });
}
