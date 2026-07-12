// Cron endpoint: procesa eventos webhook pendientes o failed con retries < 3.
// Diseñado para ser llamado por Vercel Cron (o cron externo) cada 1-2 minutos.
// Seguridad: header X-Cron-Secret = process.env.CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhookEventRow } from "@/lib/smarttalk/meta-webhook";
import type { MetaWebhookPayload } from "@/lib/smarttalk/meta-parser";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({
    batch: rows?.length ?? 0,
    processed,
    failed,
    errors,
  });
}
