// Métricas por organización. Bearer $CRON_SECRET.
// GET /api/inbox/org-metrics?organization_id=X
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

const STATUSES = ["open", "pending", "resolved", "closed"] as const;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = new URL(request.url).searchParams.get("organization_id");
  if (!orgId) {
    return NextResponse.json({ error: "organization_id requerido" }, { status: 400 });
  }

  const admin = createAdminClient("smarttalk");
  const nowIso = new Date().toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const conversationCounts: Record<string, number> = {};
  await Promise.all(
    STATUSES.map(async (status) => {
      const { count } = await admin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", status);
      conversationCounts[status] = count ?? 0;
    })
  );

  const { data: unreadRows } = await admin
    .from("conversations")
    .select("unread_count")
    .eq("organization_id", orgId)
    .in("status", ["open", "pending"]);
  const unreadTotal = (unreadRows ?? []).reduce(
    (sum, row) => sum + Number(row.unread_count ?? 0),
    0
  );

  // messages_last_24h: join a conversations por org
  const { data: convIds } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId);
  const idList = (convIds ?? []).map((c) => c.id as string);
  let messagesLast24h = 0;
  if (idList.length > 0) {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", idList)
      .gte("created_at", oneDayAgo);
    messagesLast24h = count ?? 0;
  }

  const { count: agentsOnline } = await admin
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "online");
  const { count: agentsTotal } = await admin
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  return NextResponse.json({
    ts: nowIso,
    organization_id: orgId,
    conversations: conversationCounts,
    unreadTotal,
    messagesLast24h,
    agents: { online: agentsOnline ?? 0, total: agentsTotal ?? 0 },
  });
}
