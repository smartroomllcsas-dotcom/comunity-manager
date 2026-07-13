// Health check público. Sin auth — para uptime monitors externos.
// Devuelve DB status + métricas del inbox (queue depth, dead letters).
// Cached por worker durante CACHE_TTL_MS y en el edge vía Cache-Control.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEAD_LETTER_ATTEMPTS = 3;
const CACHE_TTL_MS = 15_000;
const EDGE_CACHE_SECONDS = 15;

let cache: { at: number; body: Record<string, unknown>; status: number } | null = null;

function jsonWithCacheHeaders(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": `public, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=${EDGE_CACHE_SECONDS * 2}`,
    },
  });
}

export async function GET() {
  // Fast path: si la última respuesta está fresca, devolvemos memoria (no DB hit).
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return jsonWithCacheHeaders(cache.body, cache.status);
  }

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
    const body = {
      ok: false,
      ts: nowIso,
      database: { ok: false, error: err instanceof Error ? err.message : String(err) },
      latencyMs: Date.now() - startedAt,
    };
    // No cacheamos errores para que se recuperen rápido.
    cache = null;
    return NextResponse.json(body, { status: 503 });
  }

  const degradedReasons: string[] = [];
  if ((queueDepth.oldestPendingAgeSec ?? 0) > 300) degradedReasons.push("queue_stall_pending_over_5m");
  if (queueDepth.dead > 0) degradedReasons.push("dead_letters_present");
  const degraded = degradedReasons.length > 0;

  const body = {
    ok: !degraded,
    degraded,
    degradedReasons,
    ts: nowIso,
    database: { ok: databaseOk },
    webhookEvents: queueDepth,
    latencyMs: Date.now() - startedAt,
  };
  cache = { at: Date.now(), body, status: 200 };
  return jsonWithCacheHeaders(body, 200);
}
