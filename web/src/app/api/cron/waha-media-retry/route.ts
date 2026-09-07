/**
 * Cron (cada 10 min): repara mensajes del canal WhatsApp por QR (WAHA).
 *
 * 1. Mensajes guardados como `{ text }` sin `type` (bug del 4–7 sep): se les
 *    pone `type: "text"` para que el Inbox los muestre en vez de "[undefined]".
 * 2. Adjuntos que quedaron sin descargar (media_note / media_error /
 *    provider_url sin storage_path): se busca la URL en el evento de webhook
 *    original y se descarga desde WAHA con la X-Api-Key del servidor.
 *
 * Idempotente y acotado por corrida.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildWahaAttachmentContent } from "@/lib/waha/media";
import { processWahaWebhookEvent } from "@/lib/waha/webhook-handler";
import type { WahaMessageEvent } from "@/lib/waha/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TEXT_FIX_LIMIT = 2000;
const MEDIA_FIX_LIMIT = 40;
const FROMME_SCAN_LIMIT = 800;

type MsgRow = {
  id: string;
  wa_message_id: string | null;
  type: string;
  content: Record<string, unknown> | null;
  conversation: { channel_id: string; organization_id: string; brand_id: string; channel: { type: string } } | null;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient("smarttalk");

  // 1) Texto sin type.
  const { data: textRows } = await admin
    .from("messages")
    .select("id, content, conversation:conversations!inner(channel:channels!inner(type))")
    .is("content->>type", null)
    .eq("conversation.channel.type", "waha")
    .limit(TEXT_FIX_LIMIT);
  let textFixed = 0;
  for (const row of (textRows || []) as Array<{ id: string; content: Record<string, unknown> | null }>) {
    const c = row.content || {};
    if (c.media_note) continue; // los adjuntos viejos se tratan en el paso 2
    await admin.from("messages").update({ content: { type: "text", text: String(c.text ?? "") } }).eq("id", row.id);
    textFixed += 1;
  }

  // 2) Adjuntos sin descargar.
  const { data: mediaRows } = await admin
    .from("messages")
    .select("id, wa_message_id, type, content, conversation:conversations!inner(channel_id, organization_id, brand_id, channel:channels!inner(type))")
    .eq("conversation.channel.type", "waha")
    // Adjuntos viejos: quedaron como texto vacío (WAHA no mandaba `type`), o
    // con media_note / media_error de un intento fallido.
    .or("content->>media_note.not.is.null,content->>media_error.not.is.null,content->>text.eq.")
    .order("created_at", { ascending: false })
    .limit(MEDIA_FIX_LIMIT);

  let mediaFixed = 0;
  let mediaFailed = 0;
  const pending = ((mediaRows || []) as unknown as MsgRow[]).filter((m) => !m.content?.storage_path);

  // URLs de los adjuntos, desde los eventos de webhook originales.
  const ids = pending.map((m) => m.wa_message_id).filter((v): v is string => Boolean(v));
  const mediaByWaId = new Map<string, { url?: string | null; mimetype?: string | null; filename?: string | null; body?: string }>();
  if (ids.length > 0) {
    const { data: events } = await admin
      .from("webhook_events")
      .select("payload")
      .eq("channel", "waha")
      .order("created_at", { ascending: false })
      .limit(600);
    for (const ev of events || []) {
      const p = ((ev.payload as { payload?: Record<string, unknown> } | null)?.payload || {}) as Record<string, unknown>;
      const id = typeof p.id === "string" ? p.id : null;
      const media = p.media as { url?: string; mimetype?: string; filename?: string } | null | undefined;
      if (id && media?.url && ids.includes(id) && !mediaByWaId.has(id)) {
        mediaByWaId.set(id, { ...media, body: typeof p.body === "string" ? p.body : "" });
      }
    }
  }

  for (const m of pending) {
    const conv = m.conversation;
    const c = m.content || {};
    const fromEvent = m.wa_message_id ? mediaByWaId.get(m.wa_message_id) : undefined;
    const providerUrl = (typeof c.provider_url === "string" && c.provider_url) || fromEvent?.url || null;
    if (!conv || !providerUrl) {
      mediaFailed += 1;
      continue;
    }
    const rebuilt = await buildWahaAttachmentContent({
      organizationId: conv.organization_id,
      brandId: conv.brand_id,
      media: {
        url: providerUrl,
        mimetype: (typeof c.mime_type === "string" && c.mime_type) || fromEvent?.mimetype || null,
        filename: (typeof c.filename === "string" && c.filename) || fromEvent?.filename || null,
      },
      caption: (typeof c.caption === "string" && c.caption) || fromEvent?.body || null,
      providerType: m.type !== "text" ? m.type : null,
    });
    if (!rebuilt.storage_path) {
      mediaFailed += 1;
      continue;
    }
    await admin.from("messages").update({ type: rebuilt.type, content: rebuilt }).eq("id", m.id);
    mediaFixed += 1;
    try {
      const { understandInboundMedia } = await import("@/lib/chatbot/media-understanding");
      await understandInboundMedia({
        messageId: m.id,
        organizationId: conv.organization_id,
        brandId: conv.brand_id,
        channelId: conv.channel_id,
        content: rebuilt,
      });
    } catch {
      // best-effort
    }
  }

  // 3) Respuestas escritas desde el celular (fromMe) que se descartaron antes
  //    del 7 sep: se reprocesan desde el evento original y quedan como
  //    mensajes salientes en su conversación.
  let fromMeRecovered = 0;
  let fromMeFailed = 0;
  {
    const { data: events } = await admin
      .from("webhook_events")
      .select("id, payload")
      .eq("channel", "waha")
      .order("created_at", { ascending: false })
      .limit(FROMME_SCAN_LIMIT);
    const candidates = (events || [])
      .map((ev) => ({ id: ev.id as string, payload: ev.payload as WahaMessageEvent }))
      .filter((ev) => {
        const p = (ev.payload?.payload || {}) as Record<string, unknown>;
        return (
          (ev.payload?.event === "message" || ev.payload?.event === "message.any") &&
          p.fromMe === true &&
          typeof p.id === "string"
        );
      });
    const ids = [...new Set(candidates.map((c) => String((c.payload.payload as { id: string }).id)))];
    const { data: existing } = ids.length
      ? await admin.from("messages").select("wa_message_id").in("wa_message_id", ids)
      : { data: [] as Array<{ wa_message_id: string }> };
    const have = new Set((existing || []).map((m) => m.wa_message_id as string));
    const seen = new Set<string>();
    for (const c of candidates) {
      const waId = String((c.payload.payload as { id: string }).id);
      if (have.has(waId) || seen.has(waId)) continue;
      seen.add(waId);
      const result = await processWahaWebhookEvent({ id: c.id, payload: c.payload, admin });
      if (result.ok) fromMeRecovered += 1;
      else fromMeFailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    textFixed,
    mediaFixed,
    mediaFailed,
    mediaPending: pending.length,
    fromMeRecovered,
    fromMeFailed,
  });
}
