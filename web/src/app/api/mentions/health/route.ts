/**
 * Sprint 25 · Brand Health API
 *  - GET /api/mentions/health?client_id=X&window=24h|7d|30d
 *
 * Returns:
 *   - latest: latest snapshot row
 *   - series: array of snapshots in the requested window (for chart)
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

const WINDOWS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export async function GET(req: NextRequest) {
  const smart = await createServerClient();
  const {
    data: { user },
  } = await smart.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`mentions:health:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id");
  const windowKey = sp.get("window") ?? "24h";
  const windowMs = WINDOWS[windowKey] ?? WINDOWS["24h"];

  if (!clientId) {
    return NextResponse.json(
      { error: "client_id_required" },
      { status: 400 },
    );
  }

  const admin = getPublicAdmin();

  // Verify org access.
  const { data: clientRow } = await admin
    .from("cm_clients")
    .select("id, organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!clientRow) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }
  const { data: agentRow } = await smart
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agentRow || agentRow.organization_id !== clientRow.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - windowMs).toISOString();
  const { data: series, error } = await admin
    .from("cm_brand_health_scores")
    .select(
      "snapshot_at, window_hours, mentions_count, sentiment_avg, sentiment_delta_pct, positive_pct, neutral_pct, negative_pct, crisis_triggered, health_score",
    )
    .eq("client_id", clientId)
    .gte("snapshot_at", since)
    .order("snapshot_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = series ?? [];
  const latest = rows.length ? rows[rows.length - 1] : null;

  return NextResponse.json({ latest, series: rows, window: windowKey });
}
