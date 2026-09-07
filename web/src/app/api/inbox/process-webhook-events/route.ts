// Cron endpoint: procesa eventos webhook pendientes o failed con retries < 3.
// Diseñado para ser llamado por Vercel Cron (GET con Authorization: Bearer)
// o cron externo (POST con X-Cron-Secret).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhookEventRow } from "@/lib/smarttalk/meta-webhook";
import { alertDeadLettersIfAny, alertQueueStallIfAny } from "@/lib/smarttalk/dead-letter-alert";
import type { MetaWebhookPayload } from "@/lib/smarttalk/meta-parser";

// Analizar adjuntos (descarga + transcripción/descripción) y responder con IA
// puede tardar más que el límite por defecto de la función.
export const maxDuration = 300;

const MAX_ATTEMPTS = Math.min(
  Math.max(Number(process.env.WEBHOOK_MAX_ATTEMPTS) || 3, 1),
  10
);
const BATCH_SIZE = 20;
const RETENTION_DAYS = 7;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  const custom = request.headers.get("x-cron-secret");
  return custom === secret;
}

// Reclamo atómico: cada invocación marca "processing" las filas que va a
// procesar (UPDATE condicional). Antes dos invocaciones solapadas (cada 2 min,
// hasta 5 min de duración) tomaban las mismas filas y el agente respondía
// dos veces. `processed_at` en una fila "processing" es la hora del reclamo;
// si pasa el lease sin terminar (función caída), se vuelve a tomar.
const CLAIM_LEASE_MS = 4 * 60 * 1000;
const TIME_BUDGET_MS = 230 * 1000;
const CONCURRENCY = 4;

type QueueRow = { id: string; channel: string; payload: unknown; attempts: number; status: string };

async function claimRows(admin: ReturnType<typeof createAdminClient>): Promise<QueueRow[] | { error: string }> {
  const staleBefore = new Date(Date.now() - CLAIM_LEASE_MS).toISOString();
  const { data: candidates, error } = await admin
    .from("webhook_events")
    .select("id, status, processed_at")
    .or(
      `status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS}),and(status.eq.processing,processed_at.lt.${staleBefore})`
    )
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return { error: error.message };
  const ids = (candidates ?? []).map((r) => r.id as string);
  if (ids.length === 0) return [];
  const { data: claimed, error: claimErr } = await admin
    .from("webhook_events")
    .update({ status: "processing", processed_at: new Date().toISOString() })
    .in("id", ids)
    .or(`status.eq.pending,status.eq.failed,and(status.eq.processing,processed_at.lt.${staleBefore})`)
    .select("id, channel, payload, attempts, status");
  if (claimErr) return { error: claimErr.message };
  return (claimed ?? []) as QueueRow[];
}

// Los eventos del mismo chat se procesan en orden; chats distintos en paralelo.
function groupKey(row: QueueRow): string {
  const p = row.payload as { payload?: { from?: string; to?: string }; entry?: Array<{ id?: string }> } | null;
  if (row.channel === "waha") return `waha:${p?.payload?.from ?? p?.payload?.to ?? row.id}`;
  return `${row.channel}:${p?.entry?.[0]?.id ?? row.id}`;
}

async function processBatch() {
  const admin = createAdminClient("smarttalk");
  const startedAt = Date.now();

  let processed = 0;
  let failed = 0;
  let batches = 0;
  const errors: Array<{ id: string; error: string }> = [];

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const claimed = await claimRows(admin);
    if (!Array.isArray(claimed)) {
      return NextResponse.json({ error: claimed.error }, { status: 500 });
    }
    if (claimed.length === 0) break;
    batches++;

    const groups = new Map<string, QueueRow[]>();
    for (const row of claimed) {
      const key = groupKey(row);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    const queue = Array.from(groups.values());
    const worker = async () => {
      for (;;) {
        const group = queue.shift();
        if (!group) return;
        for (const row of group) {
          const result = await processWebhookEventRow({
            id: row.id,
            channel: row.channel,
            payload: row.payload as MetaWebhookPayload,
          });
          if (result.ok) {
            processed++;
          } else {
            failed++;
            errors.push({ id: row.id, error: result.error || "unknown" });
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  }

  // Verifica dead letters + queue stall y notifica si aplica (cooldown interno).
  const alert = await alertDeadLettersIfAny();
  const stallAlert = await alertQueueStallIfAny();

  // Retention: borra webhook_events procesados hace >7 días.
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 86400 * 1000).toISOString();
  const { count: retentionDeleted } = await admin
    .from("webhook_events")
    .delete({ count: "exact" })
    .eq("status", "processed")
    .lt("processed_at", retentionCutoff);

  // Retention: rate_limit_hits con hit_at >24h ya no aportan (ventana máxima usada es 15 min).
  const rateLimitCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: rateLimitDeleted } = await admin
    .from("rate_limit_hits")
    .delete({ count: "exact" })
    .lt("hit_at", rateLimitCutoff);

  return NextResponse.json({
    batches,
    processed,
    failed,
    errors,
    deadLetterAlert: alert,
    queueStallAlert: stallAlert,
    retentionDeleted: retentionDeleted ?? 0,
    rateLimitDeleted: rateLimitDeleted ?? 0,
  });
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return processBatch();
}

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return processBatch();
}
