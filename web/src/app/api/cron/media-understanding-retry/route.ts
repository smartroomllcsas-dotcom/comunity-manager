/**
 * Reprocesa adjuntos entrantes que el agente no pudo leer (ai_text_error):
 * audios sin transcriptor, reels de IG sin archivo y documentos con mime real
 * de imagen/audio/video. Con `respond=1` además dispara al chatbot en las
 * conversaciones cuyo último mensaje entrante es el reparado (el engine ya
 * respeta ai_paused y asesores humanos activos).
 *
 * GET /api/cron/media-understanding-retry?hours=96&limit=12&respond=1
 * Con `respondFixed=1` no repara: dispara al chatbot en conversaciones cuyo
 * último inbound ya tiene ai_text reparado (ai_text_source openai/provider_url).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttachmentContent } from "@/lib/inbox/attachments";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Row = {
  id: string;
  created_at: string;
  conversation_id: string;
  content: Record<string, unknown> | null;
  conversation: {
    id: string;
    organization_id: string;
    brand_id: string;
    channel_id: string | null;
    contact_id: string | null;
    contact: { wa_id: string | null } | null;
  } | null;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const hours = Math.min(Number(url.searchParams.get("hours")) || 96, 24 * 30);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 12, 40);
  const respond = url.searchParams.get("respond") === "1";
  // respondFixed=1: no repara nada; dispara al chatbot en conversaciones cuyo
  // último inbound ya fue reparado en pasadas previas (ai_text via retry).
  const respondFixed = url.searchParams.get("respondFixed") === "1";

  const admin = createAdminClient("smarttalk");
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const baseQuery = () =>
    admin
      .from("messages")
      .select(
        "id, created_at, conversation_id, content, conversation:conversations!inner(id, organization_id, brand_id, channel_id, contact_id, contact:contacts(wa_id))",
      )
      .eq("direction", "inbound")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(limit);
  const { data, error } = respondFixed
    ? await baseQuery()
        .in("content->>ai_text_source", ["openai", "provider_url"])
        .not("content->>ai_text", "is", null)
    : await baseQuery().not("content->>ai_text_error", "is", null).is("content->>ai_text", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  let fixed = 0;
  let responded = 0;

  for (const row of (data || []) as unknown as Row[]) {
    const conv = row.conversation;
    if (!conv) continue;
    const before = String(row.content?.ai_text_error || "");

    let messageText: string;
    let afterContent: Record<string, unknown>;
    if (respondFixed) {
      messageText = String(row.content?.ai_text || "");
      afterContent = (row.content || {}) as Record<string, unknown>;
    } else {
      const { understandInboundMedia } = await import("@/lib/chatbot/media-understanding");
      messageText = await understandInboundMedia({
        messageId: row.id,
        organizationId: conv.organization_id,
        brandId: conv.brand_id,
        channelId: conv.channel_id,
        content: row.content as unknown as AttachmentContent,
      });

      const { data: after } = await admin
        .from("messages")
        .select("content")
        .eq("id", row.id)
        .single();
      afterContent = (after?.content || {}) as Record<string, unknown>;
    }
    const ok = typeof afterContent.ai_text === "string" && afterContent.ai_text;
    if (ok && !respondFixed) fixed += 1;

    let didRespond = false;
    if (ok && (respond || respondFixed)) {
      // Solo si este sigue siendo el último mensaje entrante de la
      // conversación (si el cliente escribió después, ese flujo ya respondió).
      const { data: newer } = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound")
        .gt("created_at", row.created_at)
        .limit(1);
      if (!newer?.length && conv.contact?.wa_id) {
        try {
          const { processIncomingWithChatbot } = await import("@/lib/chatbot/engine");
          didRespond = await processIncomingWithChatbot({
            conversationId: conv.id,
            contactWaId: conv.contact.wa_id,
            contactId: conv.contact_id || undefined,
            organizationId: conv.organization_id,
            channelId: conv.channel_id || undefined,
            messageText,
            messageId: row.id,
          });
          if (didRespond) responded += 1;
        } catch (e) {
          console.error("[media-retry] chatbot falló:", e);
        }
      }
    }

    results.push({
      message_id: row.id,
      error_before: before,
      ok: Boolean(ok),
      error_after: ok ? null : afterContent.ai_text_error || null,
      responded: didRespond,
    });
  }

  return NextResponse.json({ scanned: (data || []).length, fixed, responded, results });
}
