/**
 * Sprint 26 · Agente Q — POST /api/notify/test
 *
 * Endpoint dev/staging para probar envíos. Admin-only (is_super_admin).
 * Envía una notificación simple usando el template `custom` a un destino
 * dado por el body: { channel, to, subject?, text?, html? }.
 *
 * Ejemplo curl:
 *   curl -X POST /api/notify/test -H 'content-type: application/json' \
 *     --cookie 'sb-...=...' \
 *     -d '{"channel":"email","to":"me@example.com","subject":"hi","text":"hola"}'
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { notify, type NotificationChannel } from "@/lib/notify/dispatcher";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, error: "Unauthorized" as const };

  const admin = createAdminClient("smarttalk");
  const { data: agent } = await admin
    .from("agents")
    .select("id, is_super_admin, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!agent?.is_super_admin) return { user: null, agent: null, error: "Forbidden" as const };
  return { user, agent, error: null };
}

export async function POST(request: NextRequest) {
  const { user, agent, error } = await requireSuperAdmin();
  if (!user || !agent) {
    const status = error === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error }, { status });
  }

  const rl = await rateLimit(`notify-test:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const channel = body.channel as NotificationChannel;
  const to = body.to as string;
  if (!channel || !to) {
    return NextResponse.json({ error: "channel y to requeridos" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject : "Test notification";
  const text = typeof body.text === "string" ? body.text : "Este es un envío de prueba desde /api/notify/test.";
  const html = typeof body.html === "string" ? body.html : `<p>${text}</p>`;

  const recipients: Record<string, unknown> = {};
  if (channel === "email") recipients.email = to;
  else if (channel === "slack") recipients.slack_channel = to;
  else if (channel === "whatsapp") recipients.phone = to;

  const orgId = (agent as { organization_id?: string }).organization_id;
  if (!orgId) {
    return NextResponse.json(
      { error: "agent has no organization_id" },
      { status: 400 },
    );
  }

  const response = await notify({
    organizationId: orgId,
    channels: [channel],
    recipients: recipients as never,
    template: "custom",
    variables: { subject, text, html, slack: text },
  });

  const allOk = response.results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results: response.results }, { status: allOk ? 200 : 207 });
}
