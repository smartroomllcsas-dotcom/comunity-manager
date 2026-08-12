/**
 * Sprint 26 · Inbox unificado — GET/PATCH /api/inbox/[conversationId]
 *
 * GET  → devuelve el thread completo (todas las mentions/messages ordenados)
 * PATCH → { assigned_to?, status? }   optimistic updates desde el cliente
 *
 * conversationId es la key generada por makeConversationKey():
 *   "cm:<hash>"  → grupo de cm_mentions
 *   "st:<uuid>"  → smarttalk conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import {
  makeConversationKey,
  parseConversationKey,
} from "@/lib/inbox/conversation-key";
import {
  agentCanAccessBrand,
  getAccessibleConversation,
  getBrandScopeAgent,
} from "@/lib/smarttalk/brand-scope";

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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rl = await rateLimit(`inbox:thread:${user.id}`, 120, 60_000);
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

  const agent = await getBrandScopeAgent(user.id);
  if (!agent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const clientId = req.nextUrl.searchParams.get("client_id");
  if (!clientId) {
    return NextResponse.json(
      { error: "client_id_required" },
      { status: 400 },
    );
  }

  if (parsed.source === "cm_mentions") {
    if (!(await agentCanAccessBrand(agent, clientId))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Recuperamos todas las mentions del mismo grupo. El hash no es reversible,
    // así que traemos todas las del client y filtramos por hash coincidente.
    const admin = createAdminClient("public");
    const { data: all, error } = await admin
      .from("cm_mentions")
      .select(
        "id, client_id, platform, source_type, source_url, author_handle, author_followers, content, sentiment_score, sentiment_label, urgency_score, is_processed, responded_at, responded_by, fetched_at, metadata",
      )
      .eq("client_id", clientId)
      .eq("organization_id", agent.organization_id)
      .order("fetched_at", { ascending: true })
      .limit(2000);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const matching = (all ?? []).filter((m) => {
      const k = makeConversationKey({
        clientId: m.client_id as string,
        platform: m.platform as string,
        authorHandle: m.author_handle as string | null,
      });
      return k === conversationId;
    });
    if (matching.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const first = matching[0] as { author_handle: string | null; author_followers: number | null; platform: string };
    return NextResponse.json({
      conversation: {
        id: conversationId,
        source: "cm_mentions" as const,
        client_id: clientId,
        platform: first.platform,
        author: {
          handle: first.author_handle,
          followers: first.author_followers,
          avatar_url: null,
        },
      },
      messages: matching.map((m) => ({
        id: m.id,
        direction: "inbound" as const,
        content: m.content,
        source_type: m.source_type,
        source_url: m.source_url,
        sentiment_label: m.sentiment_label,
        urgency_score: m.urgency_score,
        at: m.fetched_at,
        responded_at: m.responded_at,
      })),
    });
  }

  // parsed.source === 'smarttalk'
  try {
    const stAdmin = createAdminClient("smarttalk");
    const conv = await getAccessibleConversation(agent, parsed.ref);
    if (!conv) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (conv.brand_id !== clientId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if ((conv.contact as { visibility_status?: string } | null)?.visibility_status === "restricted") {
      return NextResponse.json({ error: "contact_restricted", message: "Amplía el plan para ver este contacto" }, { status: 402 });
    }
    const { data: msgs } = await stAdmin
      .from("messages")
      .select("id, content, direction, created_at, sender_type, media_url")
      .eq("conversation_id", parsed.ref)
      .order("created_at", { ascending: true })
      .limit(500);
    return NextResponse.json({
      conversation: {
        id: conversationId,
        source: "smarttalk" as const,
        client_id: clientId,
        platform: conv.channel_type,
        author: {
          handle: conv.contact_id,
          followers: null,
          avatar_url: null,
        },
        assigned_to: conv.assigned_agent_id ?? null,
        status: conv.status,
      },
      messages: (msgs ?? []).map((m) => ({
        id: (m as { id: string }).id,
        direction: (m as { direction: string }).direction as "inbound" | "outbound",
        content: (m as { content: string }).content,
        media_url: (m as { media_url: string | null }).media_url,
        at: (m as { created_at: string }).created_at,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "smarttalk_unavailable" },
      { status: 503 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rl = await rateLimit(`inbox:patch:${user.id}`, 60, 60_000);
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

  const agent = await getBrandScopeAgent(user.id);
  if (!agent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const patch = body as { assigned_to?: string | null; status?: string };
  const validStatus = ["unread", "read", "archived"];
  if (patch.status && !validStatus.includes(patch.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const clientId = req.nextUrl.searchParams.get("client_id");
  if (!clientId && parsed.source === "cm_mentions") {
    return NextResponse.json(
      { error: "client_id_required" },
      { status: 400 },
    );
  }

  if (parsed.source === "cm_mentions") {
    if (!(await agentCanAccessBrand(agent, clientId!))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const admin = createAdminClient("public");
    // Recuperar filas del grupo para actualizar todas.
    const { data: all } = await admin
      .from("cm_mentions")
      .select("id, client_id, platform, author_handle, metadata, responded_at, is_processed")
      .eq("client_id", clientId!)
      .eq("organization_id", agent.organization_id)
      .limit(2000);
    const targetIds: string[] = [];
    for (const m of all ?? []) {
      const k = makeConversationKey({
        clientId: (m as { client_id: string }).client_id,
        platform: (m as { platform: string }).platform,
        authorHandle: (m as { author_handle: string | null }).author_handle,
      });
      if (k === conversationId) targetIds.push((m as { id: string }).id);
    }
    if (targetIds.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Merge metadata en cliente y update.
    const now = new Date().toISOString();
    for (const row of all ?? []) {
      const rid = (row as { id: string }).id;
      if (!targetIds.includes(rid)) continue;
      const meta = ((row as { metadata: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>;
      const newMeta: Record<string, unknown> = { ...meta };
      if (patch.assigned_to !== undefined) {
        newMeta.assigned_to = patch.assigned_to;
      }
      const update: Record<string, unknown> = { metadata: newMeta };
      if (patch.status === "read") {
        update.is_processed = true;
        if (!(row as { responded_at: string | null }).responded_at) {
          update.responded_at = now;
          update.responded_by = user.id;
        }
      } else if (patch.status === "archived") {
        update.is_processed = true;
        newMeta.action = "ignored";
      } else if (patch.status === "unread") {
        update.is_processed = false;
        update.responded_at = null;
        update.responded_by = null;
        if (newMeta.action === "ignored") delete newMeta.action;
      }
      await admin.from("cm_mentions").update(update).eq("id", rid);
    }
    return NextResponse.json({ ok: true, updated: targetIds.length });
  }

  // smarttalk
  try {
    const conversation = await getAccessibleConversation(agent, parsed.ref);
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (conversation.brand_id !== clientId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const stAdmin = createAdminClient("smarttalk");
    const update: Record<string, unknown> = {};
    if (patch.assigned_to !== undefined) update.assigned_agent_id = patch.assigned_to;
    if (patch.status === "read") update.unread_count = 0;
    if (patch.status === "archived") update.status = "closed";
    if (patch.status === "unread") update.unread_count = 1;
    const { error } = await stAdmin
      .from("conversations")
      .update(update)
      .eq("id", parsed.ref)
      .eq("organization_id", agent.organization_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "smarttalk_unavailable" },
      { status: 503 },
    );
  }
}
