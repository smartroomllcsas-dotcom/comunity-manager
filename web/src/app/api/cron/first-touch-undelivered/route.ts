/**
 * Cron (cada hora): plantillas de primer contacto que llevan más de 24 h en
 * estado "sent" sin que Meta confirme la entrega. Suele ser un número que
 * lleva mucho sin usar WhatsApp. Se trata igual que un rebote: el lead vuelve
 * a la lista de pendientes con el motivo y se avisa a los asesores para que
 * lo contacten por llamada o correo.
 *
 * Idempotente: sólo actúa sobre contactos con wa_first_touch = "enviado" y
 * sin aviso previo; el aviso en sí se envía una vez por lead.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyLeadNeedsManualContact } from "@/lib/smarttalk/lead-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UNDELIVERED_AFTER_HOURS = Number(process.env.FIRST_TOUCH_UNDELIVERED_HOURS) || 24;
const LOOKBACK_DAYS = 7;
const DETAIL = `más de ${UNDELIVERED_AFTER_HOURS} h sin entregarse; el número parece inactivo`;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient("smarttalk");
  const now = Date.now();
  const cutoff = new Date(now - UNDELIVERED_AFTER_HOURS * 3600_000).toISOString();
  const since = new Date(now - LOOKBACK_DAYS * 86400_000).toISOString();

  const { data: messages, error } = await admin
    .from("messages")
    .select("id, contact_id, conversation_id, created_at, conversation:conversations(brand_id)")
    .eq("type", "template")
    .eq("is_bot", true)
    .eq("status", "sent")
    .gte("created_at", since)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let flagged = 0;
  let alerted = 0;
  const seen = new Set<string>();

  for (const m of messages || []) {
    const contactId = m.contact_id as string | null;
    const brandId = (m.conversation as { brand_id?: string } | null)?.brand_id || null;
    if (!contactId || !brandId || seen.has(contactId)) continue;
    seen.add(contactId);

    const { data: contact } = await admin
      .from("contacts")
      .select("custom_fields")
      .eq("id", contactId)
      .maybeSingle();
    const cf = { ...((contact?.custom_fields as Record<string, unknown> | null) || {}) };
    if (cf.wa_first_touch !== "enviado" || cf.wa_first_touch_alerted_at) continue;

    cf.wa_first_touch = `fallido (${DETAIL})`;
    cf.wa_first_touch_failed_at = new Date().toISOString();
    await admin.from("contacts").update({ custom_fields: cf }).eq("id", contactId);
    flagged += 1;

    const result = await notifyLeadNeedsManualContact({
      contactId,
      brandId,
      conversationId: m.conversation_id as string,
      cause: "whatsapp_failed",
      detail: DETAIL,
    });
    if (result.sent) alerted += 1;
  }

  return NextResponse.json({ ok: true, checked: (messages || []).length, flagged, alerted });
}
