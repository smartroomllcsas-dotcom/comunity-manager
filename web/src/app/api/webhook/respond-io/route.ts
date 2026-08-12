import { NextRequest, NextResponse } from "next/server";
import { evaluateChannelIntake } from "@/lib/smarttalk/intake-guard";
import { INACTIVE_BRAND_INTAKE_RESPONSE } from "@/lib/smarttalk/brand-status";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RespondIoWebhookEvent } from "@/lib/respond-io/types";
import { clientIp, rateLimitWithWhitelist } from "@/lib/rate-limit";
import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

export const dynamic = "force-dynamic";

// Sprint 22 hardening: 200 req/min por IP para webhooks externos.
const WEBHOOK_RATE_LIMIT = 200;
const WEBHOOK_RATE_WINDOW_MS = 60 * 1000;

function safeCompare(a: string, b: string) {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySignature(secret: string, rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const clean = signatureHeader.replace(/^sha256=/, "").trim();
  return safeCompare(expected, clean);
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const rl = await rateLimitWithWhitelist(
    ip,
    `webhook-respond-io:${ip}`,
    WEBHOOK_RATE_LIMIT,
    WEBHOOK_RATE_WINDOW_MS
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const admin = createAdminClient();
  const rawBody = await request.text();

  let event: RespondIoWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RespondIoWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channelIdHint = event.message?.channelId;

  const { data: channel } = await admin
    .from("channels")
    .select("id, organization_id, brand_id, config, type, status")
    .eq("type", "respond_io")
    .eq("respond_io_channel_id", channelIdHint ?? "")
    .maybeSingle();

  if (!channel) {
    return NextResponse.json({ error: "No matching Respond.io channel" }, { status: 404 });
  }

  // Esta ruta seleccionaba `status` pero nunca lo miraba: un canal
  // `disconnected` seguía creando contactos y conversaciones. La guarda cubre
  // las dos condiciones —canal caído y marca inactiva— y responde 200 para que
  // Respond.io no reintente.
  const intake = await evaluateChannelIntake(channel);
  if (intake.blocked) {
    return NextResponse.json(
      intake.reason === "inactive_brand"
        ? INACTIVE_BRAND_INTAKE_RESPONSE
        : { ok: true, ignored: intake.reason }
    );
  }

  const webhookSecret = (channel.config as { webhookSecret?: string } | null)?.webhookSecret;
  if (webhookSecret) {
    const sig = request.headers.get("x-respondio-signature") || request.headers.get("x-signature");
    if (!verifySignature(webhookSecret, rawBody, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  if (event.event_type !== "message.created" && event.event_type !== "message.updated") {
    return NextResponse.json({ ok: true, ignored: event.event_type });
  }

  const msg = event.message;
  const contact = event.contact;
  if (!msg || !contact) {
    return NextResponse.json({ ok: true, ignored: "no message or contact payload" });
  }

  const waId = contact.phone || contact.email || contact.id;
  if (!waId) {
    return NextResponse.json({ error: "Contact missing phone/email/id" }, { status: 400 });
  }

  const { data: existingContact } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", channel.organization_id)
    .eq("brand_id", channel.brand_id)
    .eq("respond_io_id", contact.id)
    .maybeSingle();

  let contactRowId = existingContact?.id as string | undefined;

  if (!contactRowId) {
    const { data: byWaId } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", channel.organization_id)
      .eq("brand_id", channel.brand_id)
      .eq("wa_id", waId)
      .maybeSingle();
    contactRowId = byWaId?.id as string | undefined;
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null;

  if (!contactRowId) {
    const billingDecision = await checkBillingFeature({
      organizationId: channel.organization_id,
      featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
      requestedUnits: 1,
      source: "webhook/respond-io/inbound-contact",
    });
    if (!billingDecision.allowed) {
      console.warn("[billing] inbound Respond.io contact over limit; preserving webhook", {
        organizationId: channel.organization_id,
        brandId: channel.brand_id,
        channelId: channel.id,
        currentUsage: billingDecision.currentUsage,
        limit: billingDecision.limitValue,
      });
    }

    const { data: inserted } = await admin
      .from("contacts")
      .insert({
        organization_id: channel.organization_id,
        brand_id: channel.brand_id,
        wa_id: waId,
        name: fullName,
        phone: contact.phone || null,
        email: contact.email || null,
        respond_io_id: contact.id,
      })
      .select("id")
      .single();
    contactRowId = inserted?.id as string | undefined;
  } else {
    await admin
      .from("contacts")
      .update({
        respond_io_id: contact.id,
        ...(fullName ? { name: fullName } : {}),
        ...(contact.phone ? { phone: contact.phone } : {}),
        ...(contact.email ? { email: contact.email } : {}),
      })
      .eq("id", contactRowId);
  }

  if (!contactRowId) {
    return NextResponse.json({ error: "Could not upsert contact" }, { status: 500 });
  }

  const { data: existingConvo } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", channel.organization_id)
    .eq("brand_id", channel.brand_id)
    .eq("contact_id", contactRowId)
    .eq("channel_id", channel.id)
    .maybeSingle();

  let conversationId = existingConvo?.id as string | undefined;
  if (!conversationId) {
    const { data: newConvo } = await admin
      .from("conversations")
      .insert({
        organization_id: channel.organization_id,
        brand_id: channel.brand_id,
        contact_id: contactRowId,
        channel_id: channel.id,
        status: "open",
      })
      .select("id")
      .single();
    conversationId = newConvo?.id as string | undefined;
  }

  if (!conversationId) {
    return NextResponse.json({ error: "Could not upsert conversation" }, { status: 500 });
  }

  const direction = msg.traffic === "outgoing" ? "outbound" : "inbound";
  const msgType = msg.message.type === "text" ? "text" : msg.message.type;
  const content =
    msg.message.type === "text"
      ? { type: "text", text: msg.message.text || "" }
      : {
          type: msg.message.attachment?.type || "unknown",
          url: msg.message.attachment?.url,
          caption: msg.message.attachment?.description,
        };

  await admin.from("messages").insert({
    conversation_id: conversationId,
    direction,
    type: msgType,
    content,
    wa_message_id: msg.channelMessageId || msg.messageId,
    respond_io_contact_id: contact.id,
    channel: "respond_io",
    channel_id: channel.id,
    status: direction === "inbound" ? "received" : "sent",
  });

  const preview = msg.message.type === "text"
    ? (msg.message.text || "").slice(0, 100)
    : `[${msgType}]`;

  await admin
    .from("conversations")
    .update({
      last_message_preview: preview,
      unread_count: direction === "inbound" ? 1 : 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true });
}

// Respond.io may ping with GET for health checks
export async function GET() {
  return NextResponse.json({ ok: true, service: "respond-io-webhook" });
}
