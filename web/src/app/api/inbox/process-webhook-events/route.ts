// Cron endpoint: procesa eventos webhook pendientes o failed con retries < 3.
// Diseñado para ser llamado por Vercel Cron (GET con Authorization: Bearer)
// o cron externo (POST con X-Cron-Secret).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhookEventRow } from "@/lib/smarttalk/meta-webhook";
import { alertDeadLettersIfAny, alertQueueStallIfAny } from "@/lib/smarttalk/dead-letter-alert";
import type { MetaWebhookPayload } from "@/lib/smarttalk/meta-parser";

const MAX_ATTEMPTS = 3;
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

async function processBatch() {
  const admin = createAdminClient("smarttalk");

  // Elegimos pending (nunca procesados) y failed con attempts < MAX.
  const { data: rows, error } = await admin
    .from("webhook_events")
    .select("id, channel, payload, attempts, status")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of rows ?? []) {
    const result = await processWebhookEventRow({
      id: row.id as string,
      channel: row.channel as string,
      payload: row.payload as MetaWebhookPayload,
    });
    if (result.ok) {
      processed++;
    } else {
      failed++;
      errors.push({ id: row.id as string, error: result.error || "unknown" });
    }
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

  return NextResponse.json({
    batch: rows?.length ?? 0,
    processed,
    failed,
    errors,
    deadLetterAlert: alert,
    queueStallAlert: stallAlert,
    retentionDeleted: retentionDeleted ?? 0,
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
