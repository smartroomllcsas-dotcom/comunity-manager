/**
 * Motor de difusiones v2 (por empresa).
 *
 * - prepareBroadcast: resuelve la audiencia y crea los destinatarios
 *   (pending u omitidos con motivo).
 * - processBroadcasts: lo llama el cron cada 5 min. Arranca las programadas
 *   cuya hora llegó y envía en tandas respetando el cupo por hora de cada
 *   difusión. WhatsApp API → plantilla aprobada; WhatsApp por QR → texto.
 * - updateRecipientByWamid: lo llaman los webhooks de estado de WhatsApp
 *   (entregado / leído / fallido).
 * - syncReplies: marca como "respondió" a quien escribió después del envío.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveAudience, renderVariables, renderText, type BroadcastAudience, type BroadcastChannelKind } from "./audience";

export type BroadcastRow = {
  id: string;
  organization_id: string;
  brand_id: string | null;
  name: string;
  status: string;
  channel_kind: BroadcastChannelKind;
  channel_id: string | null;
  wa_template_id: string | null;
  message_text: string | null;
  variables: Record<string, string> | null;
  audience: BroadcastAudience | null;
  scheduled_at: string | null;
  send_rate_per_hour: number | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  skipped_count: number;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
};

const MAX_PER_RUN = 40;

async function getBroadcast(id: string): Promise<BroadcastRow | null> {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin.from("broadcasts").select("*").eq("id", id).maybeSingle();
  return (data as BroadcastRow | null) || null;
}

async function templateNameOf(waTemplateId: string | null): Promise<string | null> {
  if (!waTemplateId) return null;
  const { data } = await supabaseAdmin.from("cm_wa_templates").select("name").eq("id", waTemplateId).maybeSingle();
  return (data?.name as string | undefined) || null;
}

/** Crea los destinatarios a partir de la audiencia guardada. Idempotente. */
export async function prepareBroadcast(id: string): Promise<{ ok: true; included: number; skipped: number } | { ok: false; error: string }> {
  const admin = createAdminClient("smarttalk");
  const b = await getBroadcast(id);
  if (!b) return { ok: false, error: "Difusión no encontrada" };
  if (!b.brand_id) return { ok: false, error: "La difusión no tiene empresa" };

  const templateName = await templateNameOf(b.wa_template_id);
  const audience = await resolveAudience(admin, {
    orgId: b.organization_id,
    brandId: b.brand_id,
    audience: b.audience || {},
    channelKind: b.channel_kind,
    templateName,
    publicAdmin: supabaseAdmin,
  });

  await admin.from("broadcast_recipients").delete().eq("broadcast_id", id).in("status", ["pending", "skipped"]);

  const rows = [
    ...audience.included.map((c) => ({ broadcast_id: id, contact_id: c.id, status: "pending" as const })),
    ...audience.excluded.map((c) => ({ broadcast_id: id, contact_id: c.id, status: "skipped" as const, skipped_reason: c.reason })),
  ];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("broadcast_recipients").upsert(rows.slice(i, i + 500), { onConflict: "broadcast_id,contact_id", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }

  await admin
    .from("broadcasts")
    .update({
      total_recipients: audience.included.length,
      skipped_count: audience.excluded.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return { ok: true, included: audience.included.length, skipped: audience.excluded.length };
}

/** Recalcula contadores desde los destinatarios. */
export async function refreshCounters(id: string): Promise<void> {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("broadcast_recipients")
    .select("status, delivered_at, read_at, replied_at")
    .eq("broadcast_id", id)
    .limit(20000);
  const rows = (data || []) as Array<{ status: string; delivered_at: string | null; read_at: string | null; replied_at: string | null }>;
  const sentLike = (s: string) => ["sent", "delivered", "read", "replied"].includes(s);
  const counts = {
    sent_count: rows.filter((r) => sentLike(r.status)).length,
    delivered_count: rows.filter((r) => r.delivered_at || r.read_at || r.status === "read").length,
    read_count: rows.filter((r) => r.read_at || r.status === "read").length,
    replied_count: rows.filter((r) => r.replied_at || r.status === "replied").length,
    failed_count: rows.filter((r) => r.status === "failed").length,
    skipped_count: rows.filter((r) => r.status === "skipped").length,
    total_recipients: rows.filter((r) => r.status !== "skipped").length,
  };
  const pending = rows.filter((r) => r.status === "pending").length;
  const b = await getBroadcast(id);
  const patch: Record<string, unknown> = { ...counts, updated_at: new Date().toISOString() };
  if (b && b.status === "sending" && pending === 0) {
    patch.status = "completed";
    patch.completed_at = new Date().toISOString();
  }
  await admin.from("broadcasts").update(patch).eq("id", id);
}

async function findOrCreateConversation(input: {
  orgId: string;
  brandId: string;
  contactId: string;
  channelId: string;
}): Promise<string | null> {
  const admin = createAdminClient("smarttalk");
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("contact_id", input.contactId)
    .eq("channel_id", input.channelId)
    .in("status", ["open", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created } = await admin
    .from("conversations")
    .insert({
      organization_id: input.orgId,
      brand_id: input.brandId,
      contact_id: input.contactId,
      channel_id: input.channelId,
      status: "open",
      unread_count: 0,
    })
    .select("id")
    .single();
  return (created?.id as string | undefined) || null;
}

/** Envía una tanda de una difusión en curso. Devuelve cuántos salieron. */
async function sendBatch(b: BroadcastRow): Promise<{ sent: number; failed: number; stopped?: string }> {
  const admin = createAdminClient("smarttalk");
  const rate = Math.max(1, Math.min(500, b.send_rate_per_hour || 20));
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: sentLastHour } = await admin
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", b.id)
    .gte("sent_at", hourAgo);
  const allowance = Math.min(MAX_PER_RUN, rate - (sentLastHour ?? 0));
  if (allowance <= 0) return { sent: 0, failed: 0 };

  const { data: pend } = await admin
    .from("broadcast_recipients")
    .select("id, contact_id, contacts(id, name, wa_id, custom_fields)")
    .eq("broadcast_id", b.id)
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(allowance);
  const recipients = (pend || []) as unknown as Array<{
    id: string;
    contact_id: string;
    contacts: { id: string; name: string | null; wa_id: string | null; custom_fields: Record<string, unknown> | null } | Array<{ id: string; name: string | null; wa_id: string | null; custom_fields: Record<string, unknown> | null }> | null;
  }>;
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    const cf = c?.custom_fields || {};
    const phone = String(cf.phone || cf.phone_number || c?.wa_id || "").replace(/\D/g, "");
    const contact = { name: c?.name ?? null, phone, customFields: cf };
    const now = new Date().toISOString();

    try {
      if (b.channel_kind === "whatsapp_cloud") {
        if (!b.wa_template_id) return { sent, failed, stopped: "La difusión no tiene plantilla" };
        const { sendBrandTemplate } = await import("@/lib/whatsapp/cloud/lead-engagement");
        const values = renderVariables(b.variables || {}, contact);
        const out = await sendBrandTemplate({
          clientId: b.brand_id as string,
          templateId: b.wa_template_id,
          phone,
          values,
          skipRateLimit: true, // el cupo lo controla la difusión
        });
        if (out.sent) {
          // Conversación donde quedó registrada la plantilla (la crea sendBrandTemplate)
          const { data: conv } = await admin
            .from("conversations")
            .select("id")
            .eq("contact_id", r.contact_id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          await admin
            .from("broadcast_recipients")
            .update({ status: "sent", sent_at: now, wa_message_id: out.wamid ?? null, conversation_id: conv?.id ?? null, attempts: 1 })
            .eq("id", r.id);
          sent++;
        } else {
          // Motivos que detienen toda la difusión (no son del destinatario)
          if (/^template_|template_not_found|credenciales|token|rate_limited/i.test(out.reason)) {
            return { sent, failed, stopped: out.reason };
          }
          await admin.from("broadcast_recipients").update({ status: "failed", error: out.reason.slice(0, 300), attempts: 1 }).eq("id", r.id);
          failed++;
        }
      } else {
        // WhatsApp por QR: texto libre por la sesión de la marca
        if (!b.channel_id) return { sent, failed, stopped: "La difusión no tiene canal" };
        const text = renderText(b.message_text || "", contact);
        if (!text.trim()) return { sent, failed, stopped: "La difusión no tiene texto" };
        const { sendWahaText } = await import("@/lib/waha/sender");
        const { wahaFromEnv } = await import("@/lib/waha/client");
        const { externalId } = await sendWahaText({ admin, channelId: b.channel_id, toPhone: phone, text, client: wahaFromEnv() });
        const convId = await findOrCreateConversation({ orgId: b.organization_id, brandId: b.brand_id as string, contactId: r.contact_id, channelId: b.channel_id });
        if (convId) {
          await admin.from("messages").insert({
            conversation_id: convId,
            contact_id: r.contact_id,
            direction: "outbound",
            type: "text",
            content: { type: "text", text },
            wa_message_id: externalId || null,
            status: "sent",
            is_bot: true,
          });
          await admin.from("conversations").update({ last_message_preview: text.slice(0, 100), updated_at: now }).eq("id", convId);
        }
        await admin
          .from("broadcast_recipients")
          .update({ status: "sent", sent_at: now, wa_message_id: externalId || null, conversation_id: convId, attempts: 1 })
          .eq("id", r.id);
        sent++;
        // Pausa corta entre mensajes por QR para no parecer spam.
        await new Promise((res) => setTimeout(res, 1500 + Math.random() * 1500));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      await admin.from("broadcast_recipients").update({ status: "failed", error: msg.slice(0, 300), attempts: 1 }).eq("id", r.id);
      failed++;
    }
  }
  return { sent, failed };
}

/** Pasada del cron: arranca programadas y envía tandas de las que están en curso. */
export async function processBroadcasts(budgetMs = 240_000): Promise<{ started: number; sent: number; failed: number; completed: number; errors: string[] }> {
  const admin = createAdminClient("smarttalk");
  const startedAt = Date.now();
  const out = { started: 0, sent: 0, failed: 0, completed: 0, errors: [] as string[] };
  const nowIso = new Date().toISOString();

  // Programadas cuya hora llegó
  const { data: due } = await admin
    .from("broadcasts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .limit(50);
  for (const d of (due || []) as Array<{ id: string }>) {
    await admin.from("broadcasts").update({ status: "sending", started_at: nowIso, updated_at: nowIso }).eq("id", d.id);
    out.started++;
  }

  const { data: sending } = await admin.from("broadcasts").select("*").eq("status", "sending").order("started_at", { ascending: true }).limit(50);
  for (const b of (sending || []) as BroadcastRow[]) {
    if (Date.now() - startedAt > budgetMs) break;
    try {
      const res = await sendBatch(b);
      out.sent += res.sent;
      out.failed += res.failed;
      if (res.stopped) {
        await admin.from("broadcasts").update({ status: "paused", last_error: res.stopped.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", b.id);
        out.errors.push(`${b.name}: ${res.stopped}`);
      }
      await syncReplies(b.id);
      await refreshCounters(b.id);
      const after = await getBroadcast(b.id);
      if (after?.status === "completed") out.completed++;
    } catch (e) {
      out.errors.push(`${b.name}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  // Respuestas de difusiones terminadas recientemente (7 días)
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recent } = await admin.from("broadcasts").select("id").eq("status", "completed").gte("completed_at", weekAgo).limit(50);
  for (const r of (recent || []) as Array<{ id: string }>) {
    if (Date.now() - startedAt > budgetMs) break;
    await syncReplies(r.id);
    await refreshCounters(r.id);
  }
  return out;
}

/** Marca "respondió" a quien escribió después del envío. */
export async function syncReplies(broadcastId: string): Promise<number> {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("broadcast_recipients")
    .select("id, conversation_id, sent_at")
    .eq("broadcast_id", broadcastId)
    .in("status", ["sent", "delivered", "read"])
    .is("replied_at", null)
    .not("conversation_id", "is", null)
    .limit(2000);
  let n = 0;
  for (const r of (data || []) as Array<{ id: string; conversation_id: string; sent_at: string | null }>) {
    const { data: reply } = await admin
      .from("messages")
      .select("created_at")
      .eq("conversation_id", r.conversation_id)
      .eq("direction", "inbound")
      .gt("created_at", r.sent_at || "1970-01-01")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (reply?.created_at) {
      await admin.from("broadcast_recipients").update({ status: "replied", replied_at: reply.created_at as string }).eq("id", r.id);
      n++;
    }
  }
  return n;
}

/** Webhooks de estado de WhatsApp: entregado / leído / fallido por wamid. */
export async function updateRecipientByWamid(
  wamid: string,
  status: "delivered" | "read" | "failed",
  error?: string | null
): Promise<void> {
  if (!wamid) return;
  try {
    const admin = createAdminClient("smarttalk");
    const { data: rec } = await admin
      .from("broadcast_recipients")
      .select("id, broadcast_id, status")
      .eq("wa_message_id", wamid)
      .maybeSingle();
    if (!rec) return;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (status === "delivered") {
      patch.delivered_at = now;
      if (rec.status === "sent") patch.status = "delivered";
    } else if (status === "read") {
      patch.read_at = now;
      patch.delivered_at = now;
      if (rec.status === "sent" || rec.status === "delivered") patch.status = "read";
    } else {
      patch.status = "failed";
      patch.error = (error || "WhatsApp no pudo entregar el mensaje").slice(0, 300);
    }
    await admin.from("broadcast_recipients").update(patch).eq("id", rec.id as string);
    await refreshCounters(rec.broadcast_id as string);
  } catch (e) {
    console.error("[broadcasts] estado por wamid falló:", e);
  }
}
