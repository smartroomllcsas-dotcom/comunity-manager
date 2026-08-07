import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimitWithWhitelist } from "@/lib/rate-limit";
import { verifyWahaSignature } from "@/lib/waha/signature";

export const dynamic = "force-dynamic";

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
  await admin.from("webhook_events").insert({
    channel: "waha",
    payload,
    status: "pending",
  });

  return NextResponse.json({ ok: true });
}
