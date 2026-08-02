/**
 * Sprint 26 · Agente Q — POST /api/notify
 *
 * Auth requerida (Supabase). Rate-limit 60/min por user.
 *
 * Body: NotifyRequest + { async?: boolean }
 *   - async=true (default): despacha via Inngest event `cm/notification.requested`
 *   - async=false: llama `notify(...)` inline y retorna resultados por canal
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { notify, type NotifyRequest, type NotificationChannel } from "@/lib/notify/dispatcher";
import type { TemplateId } from "@/lib/notify/templates";

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const ALLOWED_CHANNELS: NotificationChannel[] = ["email", "slack", "whatsapp"];
const ALLOWED_TEMPLATES: TemplateId[] = [
  "approval_request",
  "approval_response",
  "crisis_alert",
  "weekly_report",
  "custom",
];

function validate(body: unknown): { req?: NotifyRequest; async?: boolean; error?: string } {
  if (!body || typeof body !== "object") return { error: "Body inválido" };
  const b = body as Record<string, unknown>;

  const organizationId = typeof b.organizationId === "string" ? b.organizationId.trim() : "";
  if (!organizationId) return { error: "organizationId requerido" };

  const channelsRaw = Array.isArray(b.channels) ? b.channels : [];
  const channels = channelsRaw.filter(
    (c): c is NotificationChannel => typeof c === "string" && ALLOWED_CHANNELS.includes(c as NotificationChannel),
  );
  if (channels.length === 0) {
    return { error: `channels requerido (>=1). Válidos: ${ALLOWED_CHANNELS.join(",")}` };
  }

  const template = typeof b.template === "string" ? (b.template as TemplateId) : ("custom" as TemplateId);
  if (!ALLOWED_TEMPLATES.includes(template)) {
    return { error: `template inválido. Válidos: ${ALLOWED_TEMPLATES.join(",")}` };
  }

  const recipients =
    b.recipients && typeof b.recipients === "object"
      ? (b.recipients as NotifyRequest["recipients"])
      : {};

  const variables =
    b.variables && typeof b.variables === "object"
      ? (b.variables as Record<string, unknown>)
      : {};

  const req: NotifyRequest = {
    organizationId,
    clientId: typeof b.clientId === "string" ? b.clientId : undefined,
    channels,
    recipients,
    template,
    variables,
    attachments: Array.isArray(b.attachments)
      ? (b.attachments as NotifyRequest["attachments"])
      : undefined,
    subjectOverride: typeof b.subjectOverride === "string" ? b.subjectOverride : undefined,
  };
  const isAsync = b.async !== false; // default true
  return { req, async: isAsync };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`notify:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { req, async: isAsync, error } = validate(body);
  if (!req) return NextResponse.json({ error }, { status: 400 });

  if (isAsync) {
    try {
      const evt = await inngest.send({
        name: INNGEST_EVENTS.NOTIFICATION_REQUESTED,
        data: req,
      });
      return NextResponse.json({ ok: true, mode: "async", eventIds: evt.ids });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, error: `Inngest send failed: ${msg}` }, { status: 502 });
    }
  }

  // Sync mode — fire dispatcher inline.
  const response = await notify(req);
  const allOk = response.results.every((r) => r.ok);
  return NextResponse.json(
    { ok: allOk, mode: "sync", results: response.results },
    { status: allOk ? 200 : 207 },
  );
}
