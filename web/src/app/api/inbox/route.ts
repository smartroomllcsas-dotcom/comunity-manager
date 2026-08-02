/**
 * Sprint 26 · Inbox unificado — GET /api/inbox
 *
 * Query params:
 *   client_id   (required)
 *   platform    (optional)   instagram|facebook|whatsapp|twitter|linkedin|tiktok
 *   status      (optional)   unread|read|archived
 *   sentiment   (optional)   positive|neutral|negative
 *   assigned_to (optional)   user uuid o 'unassigned'
 *   search      (optional)   substring match against content / author_handle
 *   limit       (default 50, max 200)
 *   offset      (default 0)
 *
 * Combina cm_mentions (Sprint 25) y smarttalk conversations (si existen).
 * Devuelve conversaciones agrupadas por (client_id, platform, author_handle).
 *
 * Rate limit: 60/min por usuario.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { makeConversationKey } from "@/lib/inbox/conversation-key";

export const dynamic = "force-dynamic";

type CmMentionRow = {
  id: string;
  client_id: string;
  organization_id: string;
  platform: string;
  source_type: string;
  source_url: string | null;
  author_handle: string | null;
  author_followers: number | null;
  content: string;
  sentiment_score: number | null;
  sentiment_label: "positive" | "neutral" | "negative" | null;
  urgency_score: number | null;
  is_processed: boolean;
  responded_at: string | null;
  fetched_at: string;
  metadata: Record<string, unknown> | null;
};

type ConversationCard = {
  id: string;
  client_id: string;
  platform: string;
  source_type: string;
  author: {
    handle: string;
    followers: number | null;
    avatar_url: string | null;
  };
  last_message: {
    content: string;
    at: string;
    sentiment: "positive" | "neutral" | "negative" | null;
  };
  unread_count: number;
  urgency_max: number;
  assigned_to: string | null;
  status: "unread" | "read" | "archived";
  source: "cm_mentions" | "smarttalk";
  mention_ids: string[];
};

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

function statusFromMention(m: CmMentionRow): "unread" | "read" | "archived" {
  const meta = m.metadata ?? {};
  const action = (meta as { action?: string }).action;
  if (action === "ignored") return "archived";
  if (m.responded_at || m.is_processed) return "read";
  return "unread";
}

function assignedFromMention(m: CmMentionRow): string | null {
  const meta = (m.metadata ?? {}) as { assigned_to?: string | null };
  return meta.assigned_to ?? null;
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rl = await rateLimit(`inbox:get:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rl.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id");
  if (!clientId) {
    return NextResponse.json(
      { error: "client_id_required" },
      { status: 400 },
    );
  }

  const platform = sp.get("platform");
  const status = sp.get("status");
  const sentiment = sp.get("sentiment");
  const assignedTo = sp.get("assigned_to");
  const search = (sp.get("search") || "").trim();
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || 50)));
  const offset = Math.max(0, Number(sp.get("offset") || 0));

  const admin = createAdminClient("public");

  // Verificar que el user pertenece a la org del client via smarttalk.agents.
  const smart = await createServerClient();
  const { data: agentRow } = await smart
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!agentRow?.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // --- 1. cm_mentions ---
  let q = admin
    .from("cm_mentions")
    .select(
      "id, client_id, organization_id, platform, source_type, source_url, author_handle, author_followers, content, sentiment_score, sentiment_label, urgency_score, is_processed, responded_at, fetched_at, metadata",
    )
    .eq("client_id", clientId)
    .eq("organization_id", agentRow.organization_id)
    .order("fetched_at", { ascending: false })
    .limit(500); // over-fetch para poder agrupar antes de paginar

  if (platform) q = q.eq("platform", platform);
  if (sentiment && ["positive", "neutral", "negative"].includes(sentiment)) {
    q = q.eq("sentiment_label", sentiment);
  }
  if (search) {
    // ilike sobre content OR author_handle
    q = q.or(
      `content.ilike.%${search}%,author_handle.ilike.%${search}%`,
    );
  }

  const { data: mentions, error: mErr } = await q;
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // Agrupar por (client_id, platform, author_handle).
  const groups = new Map<string, ConversationCard>();
  for (const rawRow of (mentions ?? []) as CmMentionRow[]) {
    const key = makeConversationKey({
      clientId: rawRow.client_id,
      platform: rawRow.platform,
      authorHandle: rawRow.author_handle,
    });
    const rowStatus = statusFromMention(rawRow);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: key,
        client_id: rawRow.client_id,
        platform: rawRow.platform,
        source_type: rawRow.source_type,
        author: {
          handle: rawRow.author_handle || "unknown",
          followers: rawRow.author_followers,
          avatar_url: null,
        },
        last_message: {
          content: rawRow.content,
          at: rawRow.fetched_at,
          sentiment: rawRow.sentiment_label,
        },
        unread_count: rowStatus === "unread" ? 1 : 0,
        urgency_max: rawRow.urgency_score ?? 0,
        assigned_to: assignedFromMention(rawRow),
        status: rowStatus,
        source: "cm_mentions",
        mention_ids: [rawRow.id],
      });
    } else {
      existing.mention_ids.push(rawRow.id);
      if (rowStatus === "unread") existing.unread_count += 1;
      if ((rawRow.urgency_score ?? 0) > existing.urgency_max) {
        existing.urgency_max = rawRow.urgency_score ?? 0;
      }
      // last_message ya es el más reciente por el order() DESC.
      // Status del grupo = unread si algún miembro está unread; archived solo
      // si TODOS están archived; sino read.
      if (existing.status !== "unread" && rowStatus === "unread") {
        existing.status = "unread";
      } else if (existing.status === "archived" && rowStatus !== "archived") {
        existing.status = "read";
      }
    }
  }

  // --- 2. smarttalk conversations (opcional / condicional) ---
  // Puede no existir en el schema public — el proyecto lo tiene en smarttalk.
  // Intentamos y silenciamos error.
  try {
    const stAdmin = createAdminClient("smarttalk");
    let stQ = stAdmin
      .from("conversations")
      .select(
        "id, channel_type, contact_id, last_message_at, last_message_preview, unread_count, status, assigned_agent_id, organization_id",
      )
      .eq("organization_id", agentRow.organization_id)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (platform) stQ = stQ.eq("channel_type", platform);
    const { data: convs, error: stErr } = await stQ;
    if (!stErr && convs) {
      for (const c of convs as Array<{
        id: string;
        channel_type: string;
        contact_id: string | null;
        last_message_at: string | null;
        last_message_preview: string | null;
        unread_count: number | null;
        status: string | null;
        assigned_agent_id: string | null;
      }>) {
        const key = makeConversationKey({
          clientId,
          platform: c.channel_type,
          authorHandle: c.contact_id,
          smarttalkConversationId: c.id,
        });
        const st: "unread" | "read" | "archived" =
          c.status === "closed"
            ? "archived"
            : (c.unread_count ?? 0) > 0
              ? "unread"
              : "read";
        // Si ya existe merge (mismo contacto) sumamos; sino insert.
        const existing = groups.get(key);
        if (existing) {
          existing.unread_count += c.unread_count ?? 0;
          if (
            c.last_message_at &&
            c.last_message_at > existing.last_message.at
          ) {
            existing.last_message.content = c.last_message_preview || "";
            existing.last_message.at = c.last_message_at;
          }
        } else {
          groups.set(key, {
            id: key,
            client_id: clientId,
            platform: c.channel_type,
            source_type: "dm",
            author: {
              handle: c.contact_id || "unknown",
              followers: null,
              avatar_url: null,
            },
            last_message: {
              content: c.last_message_preview || "",
              at: c.last_message_at || new Date(0).toISOString(),
              sentiment: null,
            },
            unread_count: c.unread_count ?? 0,
            urgency_max: 0,
            assigned_to: c.assigned_agent_id,
            status: st,
            source: "smarttalk",
            mention_ids: [],
          });
        }
      }
    }
  } catch {
    // schema smarttalk no accesible — seguimos solo con cm_mentions.
  }

  // --- 3. filters post-group (status / assigned_to) ---
  let list = Array.from(groups.values());
  if (status && ["unread", "read", "archived"].includes(status)) {
    list = list.filter((c) => c.status === status);
  }
  if (assignedTo) {
    if (assignedTo === "unassigned") {
      list = list.filter((c) => !c.assigned_to);
    } else {
      list = list.filter((c) => c.assigned_to === assignedTo);
    }
  }

  // Orden final por last_message.at desc.
  list.sort((a, b) =>
    b.last_message.at.localeCompare(a.last_message.at),
  );

  const total = list.length;
  const counts_by_status = list.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    { unread: 0, read: 0, archived: 0 } as Record<string, number>,
  );

  const paged = list.slice(offset, offset + limit);

  return NextResponse.json({
    conversations: paged,
    total,
    counts_by_status,
  });
}
