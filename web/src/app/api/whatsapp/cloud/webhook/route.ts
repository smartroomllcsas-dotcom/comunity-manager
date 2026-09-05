/**
 * GET  /api/whatsapp/cloud/webhook  — verify handshake (hub.challenge)
 * POST /api/whatsapp/cloud/webhook  — receive events desde Meta
 *
 * Suscripciones que atendemos:
 *   - message_template_status_update   → status APPROVED/REJECTED/PAUSED/...
 *   - message_template_quality_update  → quality GREEN/YELLOW/RED
 *   - template_category_update         → re-categorización automática
 *   - messages (status)                → delivery updates cm_wa_template_sends
 *
 * Ruta separada del webhook FB/IG existente. Verify token propio:
 *   WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN
 * Signature via APP_SECRET (WHATSAPP_APP_SECRET).
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyMetaSignature } from "@/lib/whatsapp/cloud/client";
import { findAccountByWabaId } from "@/lib/whatsapp/cloud/business-account";

const VERIFY_TOKEN = process.env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN || "";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";

// -----------------------------------------------------------------------------
// GET verify
// -----------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verify_token inválido" }, { status: 403 });
}

// -----------------------------------------------------------------------------
// POST receive
// -----------------------------------------------------------------------------

type ChangeValue = Record<string, unknown>;
type Change = { field: string; value: ChangeValue };
type Entry = { id: string; changes?: Change[] };

export async function POST(request: NextRequest) {
  const raw = await request.text();

  // 1) Signature — fail-close en producción; en dev sin APP_SECRET, aceptamos
  //    (mismo pattern que el resto de webhooks CM).
  if (!APP_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.error("[wa/cloud/webhook] WHATSAPP_APP_SECRET no configurado en prod");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    // dev local sin APP_SECRET: continúa (loggeamos por si acaso)
    console.warn("[wa/cloud/webhook] APP_SECRET ausente — dev only, no verificar en prod");
  } else {
    const sig = request.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(raw, sig, APP_SECRET)) {
      return NextResponse.json({ error: "Signature inválida" }, { status: 401 });
    }
  }

  let payload: { object?: string; entry?: Entry[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!payload?.entry) return NextResponse.json({ ok: true, skipped: "no-entry" });

  for (const entry of payload.entry) {
    const wabaId = entry.id;
    const account = await findAccountByWabaId(wabaId);
    for (const change of entry.changes ?? []) {
      // 2) Idempotency — event_key único por (waba, field, meta_id, event, timestamp)
      const eventKey = crypto
        .createHash("sha256")
        .update(JSON.stringify({ wabaId, field: change.field, value: change.value }))
        .digest("hex");

      const { error: dupErr } = await supabaseAdmin
        .from("cm_wa_webhook_events")
        .insert({
          event_key: eventKey,
          waba_id: wabaId,
          field: change.field,
          payload: change.value,
        });
      // duplicate PK/uniq → Postgres code 23505 (dedup silently)
      if (dupErr && (dupErr as { code?: string }).code === "23505") {
        continue; // ya procesado
      }
      if (dupErr) {
        // otro error de insert — logeamos y seguimos, no cortamos el resto de events
        console.error("[wa/cloud/webhook] failed to log event", dupErr.message);
      }

      // 3) Router por field
      try {
        if (change.field === "message_template_status_update") {
          await handleTemplateStatusUpdate(wabaId, change.value, account?.client_id ?? null);
        } else if (change.field === "message_template_quality_update") {
          await handleTemplateQualityUpdate(wabaId, change.value, account?.client_id ?? null);
        } else if (change.field === "template_category_update") {
          await handleTemplateCategoryUpdate(wabaId, change.value, account?.client_id ?? null);
        } else if (change.field === "messages") {
          await handleMessagesStatus(change.value);
        }
      } catch (err) {
        console.error(`[wa/cloud/webhook] handler ${change.field} error`, err);
        // No devolvemos 500 — Meta reintenta y duplica; ya deduplicamos por event_key
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

async function handleTemplateStatusUpdate(
  wabaId: string,
  v: ChangeValue,
  clientId: string | null
) {
  const metaId = String(v.message_template_id ?? "");
  const status = String(v.event ?? "").toUpperCase();
  if (!metaId) return;

  const patch: Record<string, unknown> = {
    status,
    rejection_reason: (v.reason as string | null) ?? null,
    synced_at: new Date().toISOString(),
  };

  let query = supabaseAdmin.from("cm_wa_templates").update(patch).eq("meta_id", metaId);
  if (clientId) query = query.eq("client_id", clientId);
  await query;
}

async function handleTemplateQualityUpdate(
  wabaId: string,
  v: ChangeValue,
  clientId: string | null
) {
  const metaId = String(v.message_template_id ?? "");
  const quality = String(v.new_quality_score ?? "UNKNOWN").toUpperCase();
  if (!metaId) return;

  let query = supabaseAdmin
    .from("cm_wa_templates")
    .update({ quality, synced_at: new Date().toISOString() })
    .eq("meta_id", metaId);
  if (clientId) query = query.eq("client_id", clientId);
  await query;
}

async function handleTemplateCategoryUpdate(
  wabaId: string,
  v: ChangeValue,
  clientId: string | null
) {
  const metaId = String(v.message_template_id ?? "");
  const newCategory = String(v.new_category ?? "").toUpperCase();
  const previousCategory = String(v.previous_category ?? "").toUpperCase() || null;
  if (!metaId) return;

  let query = supabaseAdmin
    .from("cm_wa_templates")
    .update({
      category: newCategory,
      previous_category: previousCategory,
      synced_at: new Date().toISOString(),
    })
    .eq("meta_id", metaId);
  if (clientId) query = query.eq("client_id", clientId);
  await query;
}

async function handleMessagesStatus(v: ChangeValue) {
  const statuses = (v as { statuses?: Array<{ id: string; status: string; errors?: unknown }> }).statuses;
  if (!Array.isArray(statuses)) return;

  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    await supabaseAdmin
      .from("cm_wa_template_sends")
      .update({
        status: s.status,
        ...(s.errors ? { error: { errors: s.errors } } : {}),
      })
      .eq("wamid", s.id);
  }
}
