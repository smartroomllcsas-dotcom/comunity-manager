// Sprint 25 · POST /api/approval — agencia crea magic-link approval request.
//
// Auth: cookie Supabase → auth.getUser() (agencia). Rate-limit 30/min por user.
// Payload: { post_id, client_id, notify_channels: ('email'|'whatsapp')[],
//            recipient_email?, recipient_phone?, ttl_hours? }
// Genera token via HMAC, hashea con SHA-256, persiste en cm_post_approvals.
// Notifica via WhatsApp Cloud API si aplica; email queda como TODO.
// Retorna { approval_id, url, expires_at }.

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";
import { issueApprovalToken, hashToken } from "@/lib/approval/tokens";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const DEFAULT_TTL_HOURS = 168; // 7 días

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "approval route: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createSbClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

function baseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return `${proto}://${host}`;
}

interface RequestBody {
  post_id: string;
  client_id: string;
  notify_channels?: ("email" | "whatsapp")[];
  recipient_email?: string;
  recipient_phone?: string;
  ttl_hours?: number;
}

function validate(body: unknown):
  | { ok: true; value: RequestBody }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object")
    return { ok: false, error: "Body inválido" };
  const b = body as Record<string, unknown>;
  const post_id = typeof b.post_id === "string" ? b.post_id : "";
  const client_id = typeof b.client_id === "string" ? b.client_id : "";
  if (!post_id) return { ok: false, error: "post_id requerido" };
  if (!client_id) return { ok: false, error: "client_id requerido" };

  const notify = Array.isArray(b.notify_channels)
    ? b.notify_channels.filter(
        (c): c is "email" | "whatsapp" => c === "email" || c === "whatsapp",
      )
    : [];

  const ttl = typeof b.ttl_hours === "number" && b.ttl_hours > 0 && b.ttl_hours <= 720
    ? b.ttl_hours
    : DEFAULT_TTL_HOURS;

  return {
    ok: true,
    value: {
      post_id,
      client_id,
      notify_channels: notify,
      recipient_email:
        typeof b.recipient_email === "string" ? b.recipient_email : undefined,
      recipient_phone:
        typeof b.recipient_phone === "string" ? b.recipient_phone : undefined,
      ttl_hours: ttl,
    },
  };
}

async function sendWhatsAppApprovalMessage(args: {
  phone: string;
  url: string;
  clientName: string;
}): Promise<{ ok: boolean; error?: string }> {
  // FIXME(sprint-25): usar la conexión WhatsApp Cloud API real del cliente
  // (cm_whatsapp_accounts) en vez del token global. Por ahora usamos el
  // WABA de sistema si está configurado.
  const token = process.env.WHATSAPP_SYSTEM_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    console.warn(
      "[approval] WhatsApp system token missing — skipping WA notification",
    );
    return { ok: false, error: "whatsapp_not_configured" };
  }
  const body = {
    messaging_product: "whatsapp",
    to: args.phone.replace(/[^\d+]/g, ""),
    type: "text",
    text: {
      preview_url: true,
      body: `Hola! ${args.clientName ? args.clientName + ", " : ""}tienes un post pendiente de aprobación. Revísalo aquí: ${args.url}`,
    },
  };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[approval] WhatsApp send failed", res.status, t);
      return { ok: false, error: `whatsapp_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[approval] WhatsApp send exception", e);
    return { ok: false, error: "whatsapp_exception" };
  }
}

export async function POST(req: NextRequest) {
  const supa = await createServerSupabase();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const rl = await rateLimit(`approval:create:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = validate(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;

  const admin = getPublicAdmin();

  // 1) Validar que el post existe y pertenece a la misma org que el user (via cliente).
  const { data: post, error: postErr } = await admin
    .from("cm_scheduled_posts")
    .select("id, client_id, status")
    .eq("id", v.post_id)
    .maybeSingle();
  if (postErr) return Response.json({ error: postErr.message }, { status: 500 });
  if (!post) return Response.json({ error: "Post no encontrado" }, { status: 404 });
  if (post.client_id !== v.client_id) {
    return Response.json(
      { error: "client_id no coincide con el post" },
      { status: 400 },
    );
  }

  // 2) Confirmar org via cm_clients (bridge a smarttalk.organizations).
  const { data: client, error: clientErr } = await admin
    .from("cm_clients")
    .select("id, name, smarttalk_organization_id")
    .eq("id", v.client_id)
    .maybeSingle();
  if (clientErr) return Response.json({ error: clientErr.message }, { status: 500 });
  if (!client) return Response.json({ error: "Cliente no encontrado" }, { status: 404 });

  // Verificar que el user pertenece a esa org (defense-in-depth).
  const { data: agent } = await supa
    .from("agents")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  const userOrgId = (agent as { organization_id?: string } | null)?.organization_id ?? null;
  if (
    client.smarttalk_organization_id &&
    userOrgId &&
    client.smarttalk_organization_id !== userOrgId
  ) {
    return Response.json({ error: "Sin acceso a este cliente" }, { status: 403 });
  }

  const orgId = client.smarttalk_organization_id ?? userOrgId;
  if (!orgId) {
    return Response.json(
      { error: "No se pudo resolver organization_id" },
      { status: 400 },
    );
  }

  // 3) Emitir token + hash + persistir approval row.
  const token = issueApprovalToken(v.post_id, v.client_id, v.ttl_hours);
  const token_hash = hashToken(token);
  const expiresAt = new Date(Date.now() + (v.ttl_hours ?? DEFAULT_TTL_HOURS) * 3_600_000);

  const { data: approval, error: insertErr } = await admin
    .from("cm_post_approvals")
    .insert({
      post_id: v.post_id,
      client_id: v.client_id,
      organization_id: orgId,
      token_hash,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 });

  const url = `${baseUrl(req)}/approval/${token}`;

  // 4) Notificar (best-effort — no bloquea).
  const notify = v.notify_channels ?? [];
  const notifications: Record<string, string> = {};

  if (notify.includes("whatsapp") && v.recipient_phone) {
    const wa = await sendWhatsAppApprovalMessage({
      phone: v.recipient_phone,
      url,
      clientName: client.name,
    });
    notifications.whatsapp = wa.ok ? "sent" : (wa.error ?? "failed");
  }

  if (notify.includes("email") && v.recipient_email) {
    // TODO(sprint-25): integrar Resend/Mailtrap para envío real.
    console.info("[approval] email notification stub", {
      to: v.recipient_email,
      url,
    });
    notifications.email = "stub";
  }

  return Response.json({
    approval_id: approval.id,
    url,
    expires_at: expiresAt.toISOString(),
    notifications,
  });
}
