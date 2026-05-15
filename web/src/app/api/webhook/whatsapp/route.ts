// SmartTalk inbox WhatsApp webhook (persiste en schema smarttalk).
// Verifica HMAC SHA-256 con WHATSAPP_APP_SECRET. URL pública canónica para nuevos canales.
// El webhook legacy de Community Manager vive en /webhooks/whatsapp.
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import type { WebhookPayload } from "@/lib/whatsapp/types";
import { processIncomingMessage, processStatusUpdate } from "@/lib/whatsapp/webhook";
import { persistWhatsAppWebhook } from "@/lib/webhook";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("WHATSAPP_APP_SECRET is not set — webhook security not configured");
    return NextResponse.json({ error: "Webhook security not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-hub-signature-256");
  const body = await request.text();

  if (!signature) {
    console.warn("Webhook request missing x-hub-signature-256 header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const expectedSignature = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
  if (signature !== expectedSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: WebhookPayload = JSON.parse(body);

  await persistWhatsAppWebhook(payload);

  try {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;
        const { value } = change;
        const phoneNumberId = value.metadata.phone_number_id;

        if (value.messages && value.contacts) {
          for (let i = 0; i < value.messages.length; i++) {
            const message = value.messages[i];
            const contact = value.contacts[i] || value.contacts[0];
            await processIncomingMessage(message, contact, phoneNumberId);
          }
        }

        if (value.statuses) {
          for (const status of value.statuses) {
            await processStatusUpdate(status);
          }
        }
      }
    }
  } catch (error) {
    console.error("[whatsapp-webhook] SmartTalk processing failed", error);
  }

  return NextResponse.json({ status: "ok" });
}
