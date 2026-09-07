import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimitWithWhitelist } from "@/lib/rate-limit";
import { verifyWahaSignature } from "@/lib/waha/signature";

export const dynamic = "force-dynamic";
// El agente de IA puede tardar (espera de agrupación + modelo + adjuntos).
export const maxDuration = 120;

const WEBHOOK_RATE_LIMIT = 200;
const WEBHOOK_RATE_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const rl = await rateLimitWithWhitelist(
    ip,
    `webhook-waha:${ip}`,
    WEBHOOK_RATE_LIMIT,
    WEBHOOK_RATE_WINDOW_MS
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const secret = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server misconfig" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-hmac");

  if (!verifyWahaSignature(rawBody, secret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Mensajes del cliente y los enviados desde el celular se atienden en
  // línea (respuesta del agente al instante). El resto (acks, el duplicado
  // "message.any" de un entrante) va a la cola. Si algo falla en línea, el
  // evento queda "pending" y el cron lo reintenta.
  const ev = payload as { event?: string; payload?: { fromMe?: boolean } };
  const inline =
    ev.event === "message" || (ev.event === "message.any" && Boolean(ev.payload?.fromMe));
  const { data: row } = await admin
    .from("webhook_events")
    .insert({
      channel: "waha",
      payload,
      status: inline ? "processing" : "pending",
      processed_at: inline ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (inline && row?.id) {
    try {
      const { processWebhookEventRow } = await import("@/lib/smarttalk/meta-webhook");
      const result = await processWebhookEventRow({
        id: row.id as string,
        channel: "waha",
        payload: payload as never,
      });
      if (!result.ok) {
        await admin
          .from("webhook_events")
          .update({ status: "pending", processed_at: null })
          .eq("id", row.id)
          .eq("status", "processing");
      }
    } catch (e) {
      console.error("[waha] proceso en línea falló:", e);
      await admin
        .from("webhook_events")
        .update({ status: "pending", processed_at: null })
        .eq("id", row.id)
        .eq("status", "processing");
    }
  }

  return NextResponse.json({ ok: true });
}
