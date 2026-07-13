// Health check público. Sin auth — para uptime monitors externos.
// Devuelve DB status + métricas del inbox (queue depth, dead letters).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEAD_LETTER_ATTEMPTS = 3;

export async function GET() {
  const startedAt = Date.now();
  const admin = createAdminClient("smarttalk");
  const nowIso = new Date().toISOString();

  let databaseOk = false;
  let queueDepth = { pending: 0, failed: 0, dead: 0 } as {
    pending: number;
    failed: number;
    dead: number;
    oldestPendingIso?: string | null;
    oldestPendingAgeSec?: number | null;
  };

  try {
    // 1) Sanity query — pending count
    const { count: pending, error: pendingErr } = await admin
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (pendingErr) throw pendingErr;

    // 2) Failed pero aún retryable
    const { count: failed } = await admin
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .lt("attempts", DEAD_LETTER_ATTEMPTS);

    // 3) Dead — failed y sin más retries
    const { count: dead } = await admin
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("attempts", DEAD_LETTER_ATTEMPTS);

    // 4) Edad del pending más viejo
    const { data: oldestPending } = await admin
      .from("webhook_events")
      .select("created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const oldestPendingIso = (oldestPending?.created_at as string | null) ?? null;
    const oldestPendingAgeSec = oldestPendingIso
      ? Math.round((Date.now() - new Date(oldestPendingIso).getTime()) / 1000)
      : null;

    queueDepth = {
      pending: pending ?? 0,
      failed: failed ?? 0,
      dead: dead ?? 0,
      oldestPendingIso,
      oldestPendingAgeSec,
    };
    databaseOk = true;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        ts: nowIso,
        database: { ok: false, error: err instanceof Error ? err.message : String(err) },
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }

  const degraded =
    (queueDepth.oldestPendingAgeSec ?? 0) > 300 || // pending >5 min
    queueDepth.dead > 0;

  return NextResponse.json(
    {
      ok: !degraded,
      degraded,
      ts: nowIso,
      database: { ok: databaseOk },
      webhookEvents: queueDepth,
      latencyMs: Date.now() - startedAt,
    },
    { status: degraded ? 200 : 200 } // 200 aún si degraded — dashboards lo interpretan
  );
}
