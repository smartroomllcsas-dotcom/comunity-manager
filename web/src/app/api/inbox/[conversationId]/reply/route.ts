/**
 * Sprint 26 · Inbox unificado — POST /api/inbox/[conversationId]/reply
 *
 * Payload:
 *   { content?: string, use_ai_draft?: boolean, client_id: string,
 *     brand_voice_sample?: string, conversation_history?: [{role, content}] }
 *
 * Modos:
 *   - use_ai_draft=true & !content → llama draftResponse (Agente M) y devuelve
 *     los 3 drafts SIN enviar. El frontend elige y hace un segundo POST.
 *   - content presente → envía por el canal correspondiente:
 *       instagram_dm / instagram_comment / facebook_comment  →  Meta Graph
 *       whatsapp                                              →  WA Cloud API
 *       twitter / linkedin / tiktok                           →  stub log TODO
 *   - Marca cm_mentions.responded_at + responded_by
 *
 * Rate limit: 30/min por user.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import {
  makeConversationKey,
  parseConversationKey,
} from "@/lib/inbox/conversation-key";
import {
  draftResponse,
  type ResponseDraftInput,
} from "@/lib/ai/response-drafting";
import { sendMetaTextMessage } from "@/lib/meta";

export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null };
}

async function assertOrg(userId: string) {
  const smart = await createServerClient();
  const { data } = await smart
    .from("agents")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

interface ReplyBody {
  content?: string;
  use_ai_draft?: boolean;
  client_id?: string;
  brand_voice_sample?: string;
  conversation_history?: Array<{ role: "user" | "brand"; content: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rl = await rateLimit(`inbox:reply:${user.id}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  const { conversationId } = await ctx.params;
  const parsed = parseConversationKey(conversationId);
  if (!parsed) {
    return NextResponse.json(
      { error: "invalid_conversation_id" },
      { status: 400 },
    );
  }

  let body: ReplyBody;
  try {
    body = (await req.json()) as ReplyBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const clientId = body.client_id;
  if (!clientId) {
    return NextResponse.json(
      { error: "client_id_required" },
      { status: 400 },
    );
  }

  const orgId = await assertOrg(user.id);
  if (!orgId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // --- Recuperar contexto del grupo (última mention + plataforma) ---
  let platform = "";
  let incomingMessage = "";
  let targetMentionIds: string[] = [];
  let recipientHandle: string | null = null;

  if (parsed.source === "cm_mentions") {
    const admin = createAdminClient("public");
    const { data: all } = await admin
      .from("cm_mentions")
      .select(
        "id, client_id, platform, source_type, source_url, author_handle, content, fetched_at, metadata",
      )
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .order("fetched_at", { ascending: false })
      .limit(2000);
    const matching = (all ?? []).filter((m) => {
      const k = makeConversationKey({
        clientId: (m as { client_id: string }).client_id,
        platform: (m as { platform: string }).platform,
        authorHandle: (m as { author_handle: string | null }).author_handle,
      });
      return k === conversationId;
    });
    if (matching.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const first = matching[0] as {
      platform: string;
      content: string;
      author_handle: string | null;
    };
    platform = first.platform;
    incomingMessage = first.content;
    recipientHandle = first.author_handle;
    targetMentionIds = matching.map((m) => (m as { id: string }).id);
  } else {
    // smarttalk
    try {
      const st = createAdminClient("smarttalk");
      const { data: conv } = await st
        .from("conversations")
        .select("id, channel_type, contact_id, organization_id")
        .eq("id", parsed.ref)
        .maybeSingle();
      if (!conv || (conv as { organization_id: string }).organization_id !== orgId) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      platform = (conv as { channel_type: string }).channel_type;
      recipientHandle = (conv as { contact_id: string | null }).contact_id;
      const { data: lastMsg } = await st
        .from("messages")
        .select("content")
        .eq("conversation_id", parsed.ref)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      incomingMessage = (lastMsg as { content?: string } | null)?.content ?? "";
    } catch {
      return NextResponse.json(
        { error: "smarttalk_unavailable" },
        { status: 503 },
      );
    }
  }

  // --- Modo AI DRAFT (no envía) ---
  if (body.use_ai_draft && !body.content) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ai_not_configured" },
        { status: 500 },
      );
    }
    const draftInput: ResponseDraftInput = {
      clientId,
      incomingMessage,
      platform,
      brandVoiceSample: body.brand_voice_sample,
      conversationHistory: body.conversation_history,
    };
    try {
      const client = new Anthropic({ apiKey });
      const result = await draftResponse(draftInput, client);
      return NextResponse.json({ mode: "draft", ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `draft_failed: ${msg}` },
        { status: 502 },
      );
    }
  }

  // --- Modo ENVIAR ---
  const content = (body.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "content_required" }, { status: 400 });
  }

  let sendResult: { ok: boolean; provider: string; detail?: string; stub?: boolean } = {
    ok: false,
    provider: "unknown",
  };
  const p = platform.toLowerCase();
  try {
    if (p === "instagram" || p === "facebook") {
      // Necesitamos access token del canal — placeholder: leer desde channels
      // por platform+client. Si no hay, devolvemos error explícito.
      const admin = createAdminClient("smarttalk");
      const { data: channel } = await admin
        .from("channels")
        .select("access_token, meta_recipient_id_field")
        .eq("channel_type", p)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const accessToken = (channel as { access_token?: string } | null)?.access_token;
      if (!accessToken || !recipientHandle) {
        sendResult = {
          ok: false,
          provider: "meta",
          detail: "missing_token_or_recipient",
        };
      } else {
        await sendMetaTextMessage(accessToken, recipientHandle, content);
        sendResult = { ok: true, provider: "meta" };
      }
    } else if (p === "whatsapp") {
      const admin = createAdminClient("smarttalk");
      const { data: channel } = await admin
        .from("channels")
        .select("whatsapp_phone_number_id, access_token")
        .eq("channel_type", "whatsapp")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const phoneNumberId = (channel as { whatsapp_phone_number_id?: string } | null)
        ?.whatsapp_phone_number_id;
      const accessToken = (channel as { access_token?: string } | null)?.access_token;
      if (!phoneNumberId || !accessToken || !recipientHandle) {
        sendResult = {
          ok: false,
          provider: "whatsapp",
          detail: "missing_credentials_or_recipient",
        };
      } else {
        const { sendText } = await import("@/lib/whatsapp/api");
        await sendText({
          to: recipientHandle,
          text: content,
          phoneNumberId,
          accessToken,
        });
        sendResult = { ok: true, provider: "whatsapp" };
      }
    } else if (["twitter", "linkedin", "tiktok"].includes(p)) {
      // TODO Sprint 27+: integrar API oficial por canal
      console.warn(
        `[inbox/reply] Stub para ${p} — reply "${content.slice(0, 40)}" a ${recipientHandle}`,
      );
      sendResult = { ok: true, provider: p, stub: true };
    } else {
      sendResult = { ok: false, provider: p, detail: "platform_unsupported" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `send_failed: ${msg}`, provider: sendResult.provider },
      { status: 502 },
    );
  }

  if (!sendResult.ok) {
    return NextResponse.json({ error: "send_failed", detail: sendResult }, { status: 502 });
  }

  // --- Persistir efecto secundario ---
  const now = new Date().toISOString();
  if (parsed.source === "cm_mentions" && targetMentionIds.length) {
    const admin = createAdminClient("public");
    await admin
      .from("cm_mentions")
      .update({
        is_processed: true,
        responded_at: now,
        responded_by: user.id,
      })
      .in("id", targetMentionIds);
  } else if (parsed.source === "smarttalk") {
    try {
      const st = createAdminClient("smarttalk");
      await st.from("messages").insert({
        conversation_id: parsed.ref,
        content,
        direction: "outbound",
        sender_type: "agent",
        created_at: now,
      });
      await st
        .from("conversations")
        .update({ last_message_at: now, last_message_preview: content.slice(0, 200), unread_count: 0 })
        .eq("id", parsed.ref);
    } catch {
      // no bloqueamos la respuesta si la persistencia smarttalk falla
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "sent",
    provider: sendResult.provider,
    stub: sendResult.stub ?? false,
    sent_at: now,
  });
}
