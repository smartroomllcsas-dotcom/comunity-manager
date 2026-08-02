/**
 * Sprint 25 · Mentions API
 *  - GET  /api/mentions?client_id=X&sentiment=positive|negative&urgency_min=4&limit=50&cursor=<iso>
 *  - PATCH /api/mentions?id=X  { action: 'responded' | 'ignored' | 'escalated' }
 *
 * Rate limit: 60 req/min per user.
 * Auth: uses smarttalk supabase server client (RLS enforces org isolation).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase env missing");
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

async function requireUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null };
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rl = await rateLimit(`mentions:get:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
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

  const sentiment = sp.get("sentiment");
  const urgencyMin = sp.get("urgency_min");
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || 50)));
  const cursor = sp.get("cursor");

  // Use org-scoped admin: we rely on caller sending client_id, and we verify
  // the caller belongs to the client's org via a lookup.
  const admin = getPublicAdmin();

  // Sanity: verify client belongs to this user's org.
  const { data: clientRow, error: clientErr } = await admin
    .from("cm_clients")
    .select("id, organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }

  const smart = await createServerClient();
  const { data: agentRow } = await smart
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agentRow || agentRow.organization_id !== clientRow.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let q = admin
    .from("cm_mentions")
    .select(
      "id, platform, source_type, source_url, author_handle, author_followers, content, sentiment_score, sentiment_label, intent_label, urgency_score, is_processed, responded_at, fetched_at, metadata",
    )
    .eq("client_id", clientId)
    .order("fetched_at", { ascending: false })
    .limit(limit);

  if (sentiment && ["positive", "neutral", "negative"].includes(sentiment)) {
    q = q.eq("sentiment_label", sentiment);
  }
  if (urgencyMin) {
    const n = Number(urgencyMin);
    if (Number.isFinite(n)) q = q.gte("urgency_score", n);
  }
  if (cursor) q = q.lt("fetched_at", cursor);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextCursor =
    data && data.length === limit
      ? (data[data.length - 1] as { fetched_at: string }).fetched_at
      : null;

  return NextResponse.json({ mentions: data ?? [], nextCursor });
}

export async function PATCH(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rl = await rateLimit(`mentions:patch:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  let body: { action?: string } = {};
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    // empty body -> default action
  }
  const action = body.action ?? "responded";
  if (!["responded", "ignored", "escalated"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = getPublicAdmin();

  // Fetch mention to verify org.
  const { data: mention, error: mErr } = await admin
    .from("cm_mentions")
    .select("id, organization_id, metadata")
    .eq("id", id)
    .maybeSingle();
  if (mErr || !mention) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const smart = await createServerClient();
  const { data: agentRow } = await smart
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agentRow || agentRow.organization_id !== mention.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const currentMeta = (mention.metadata as Record<string, unknown>) ?? {};
  const patch: Record<string, unknown> = {
    is_processed: true,
    metadata: { ...currentMeta, action },
  };
  if (action === "responded") {
    patch.responded_at = new Date().toISOString();
    patch.responded_by = user.id;
  }

  const { error: uErr } = await admin
    .from("cm_mentions")
    .update(patch)
    .eq("id", id);
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action });
}
