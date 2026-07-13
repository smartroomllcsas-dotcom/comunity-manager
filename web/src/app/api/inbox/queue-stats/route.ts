// Endpoint autenticado con breakdown detallado del estado de la cola.
// Auth: Authorization: Bearer $CRON_SECRET o header X-Cron-Secret.
// Para dashboards internos (Grafana, BetterStack, etc).
// Cached por worker durante CACHE_TTL_MS + Cache-Control edge s-maxage=30.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEAD_LETTER_ATTEMPTS = 3;
const CACHE_TTL_MS = 30_000;
const EDGE_CACHE_SECONDS = 30;

let cache: { at: number; body: Record<string, unknown> } | null = null;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

function jsonWithCacheHeaders(body: Record<string, unknown>) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": `private, max-age=${EDGE_CACHE_SECONDS}`,
    },
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return jsonWithCacheHeaders(cache.body);
  }

  const admin = createAdminClient("smarttalk");
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

  // 1) Breakdown por canal + status
  const { data: byChannelStatus, error: err1 } = await admin
    .from("webhook_events")
    .select("channel, status", { count: "exact" });
  if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

  // Agregación en memoria (no hay group by directo en el client Supabase)
  const channelBreakdown = new Map<string, Record<string, number>>();
  for (const row of byChannelStatus ?? []) {
    const ch = String(row.channel ?? "unknown");
    const st = String(row.status ?? "unknown");
    const bucket = channelBreakdown.get(ch) ?? { pending: 0, processed: 0, failed: 0, dead: 0 };
    // Nota: dead se calcula aparte con attempts >= 3 más abajo.
    if (st === "pending" || st === "processed" || st === "failed") {
      bucket[st] = (bucket[st] ?? 0) + 1;
    }
    channelBreakdown.set(ch, bucket);
  }

  // 2) Dead letters por canal (failed && attempts >= 3)
  const { data: deadRows } = await admin
    .from("webhook_events")
    .select("channel")
    .eq("status", "failed")
    .gte("attempts", DEAD_LETTER_ATTEMPTS);
  for (const row of deadRows ?? []) {
    const ch = String(row.channel ?? "unknown");
    const bucket = channelBreakdown.get(ch) ?? { pending: 0, processed: 0, failed: 0, dead: 0 };
    bucket.dead = (bucket.dead ?? 0) + 1;
    channelBreakdown.set(ch, bucket);
  }

  // 3) Procesados en la última hora (throughput)
  const { count: processedLastHour } = await admin
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "processed")
    .gte("processed_at", oneHourAgo);

  // 4) Latencia promedio de procesamiento en la última hora
  const { data: recentProcessed } = await admin
    .from("webhook_events")
    .select("created_at, processed_at")
    .eq("status", "processed")
    .gte("processed_at", oneHourAgo)
    .limit(1000);

  const latencies = (recentProcessed ?? [])
    .map((row) => {
      if (!row.created_at || !row.processed_at) return null;
      return (
        new Date(row.processed_at as string).getTime() -
        new Date(row.created_at as string).getTime()
      );
    })
    .filter((n): n is number => n !== null && n >= 0);
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length)
    : null;
  const p95LatencyMs = latencies.length
    ? Math.round(latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)])
    : null;

  // 5) Top errores recientes
  const { data: topErrors } = await admin
    .from("webhook_events")
    .select("channel, last_error, attempts, created_at")
    .eq("status", "failed")
    .order("attempts", { ascending: false })
    .limit(10);

  const body = {
    ts: nowIso,
    channels: Object.fromEntries(channelBreakdown),
    throughput: {
      processedLastHour: processedLastHour ?? 0,
      sampleSize: latencies.length,
      avgLatencyMs,
      p95LatencyMs,
    },
    recentErrors: (topErrors ?? []).map((row) => ({
      channel: row.channel,
      attempts: row.attempts,
      last_error: String(row.last_error ?? "").slice(0, 300),
      created_at: row.created_at,
    })),
    responseLatencyMs: Date.now() - startedAt,
  };
  cache = { at: Date.now(), body };
  return jsonWithCacheHeaders(body);
}
