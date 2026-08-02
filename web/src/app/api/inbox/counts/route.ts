/**
 * Sprint 26 · Inbox unificado — GET /api/inbox/counts
 *
 * Devuelve contadores globales para badges de sidebar:
 *   { unread_total, by_client: [{client_id, unread}], by_platform: [{platform, unread}] }
 *
 * Se calcula desde cm_mentions (fuente primaria) sobre la org del user.
 * Rate limit: 120/min.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`inbox:counts:${user.id}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  const { data: agentRow } = await supabase
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agentRow?.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient("public");
  const { data: rows, error } = await admin
    .from("cm_mentions")
    .select("client_id, platform, is_processed, responded_at, metadata")
    .eq("organization_id", agentRow.organization_id)
    .limit(5000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let unreadTotal = 0;
  const byClient = new Map<string, number>();
  const byPlatform = new Map<string, number>();

  for (const r of rows ?? []) {
    const meta = (r as { metadata: Record<string, unknown> | null }).metadata ?? {};
    const action = (meta as { action?: string }).action;
    const isProcessed = (r as { is_processed: boolean }).is_processed;
    const respondedAt = (r as { responded_at: string | null }).responded_at;
    // unread = no procesado y no ignorado y sin responded_at
    if (!isProcessed && !respondedAt && action !== "ignored") {
      unreadTotal += 1;
      const cid = (r as { client_id: string }).client_id;
      const p = (r as { platform: string }).platform;
      byClient.set(cid, (byClient.get(cid) || 0) + 1);
      byPlatform.set(p, (byPlatform.get(p) || 0) + 1);
    }
  }

  // Merge unread de smarttalk si el schema existe (best-effort).
  try {
    const st = createAdminClient("smarttalk");
    const { data: convs } = await st
      .from("conversations")
      .select("channel_type, unread_count")
      .eq("organization_id", agentRow.organization_id)
      .gt("unread_count", 0)
      .limit(2000);
    for (const c of convs ?? []) {
      const n = (c as { unread_count: number }).unread_count ?? 0;
      const p = (c as { channel_type: string }).channel_type;
      unreadTotal += n;
      byPlatform.set(p, (byPlatform.get(p) || 0) + n);
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    unread_total: unreadTotal,
    by_client: Array.from(byClient.entries()).map(([client_id, unread]) => ({
      client_id,
      unread,
    })),
    by_platform: Array.from(byPlatform.entries()).map(([platform, unread]) => ({
      platform,
      unread,
    })),
  });
}
