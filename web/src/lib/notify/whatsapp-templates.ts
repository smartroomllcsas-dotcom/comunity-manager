/**
 * Sprint 26 · Agente Q — WhatsApp Business Cloud API template sender.
 *
 * Uses pre-approved Meta templates. Free-form messages must go through the
 * existing `@/lib/whatsapp/api` sendText (24h session window applies).
 *
 * Endpoint: POST https://graph.facebook.com/{version}/{phone-number-id}/messages
 *
 * Env:
 *   WHATSAPP_SYSTEM_TOKEN     (Sprint 25 — Bearer token; never logged)
 *   WHATSAPP_PHONE_NUMBER_ID  default WABA phone number ID when not passed
 *   WHATSAPP_API_VERSION      optional, default v21.0
 */

const WA_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const FETCH_TIMEOUT_MS = 15_000;

export interface WhatsAppTemplatePayload {
  phoneNumberId?: string;
  to: string; // E.164, e.g. "+573101234567"
  templateName: string;
  languageCode?: string; // default 'es'
  headerVariables?: string[];
  bodyVariables?: string[];
  buttonUrls?: Array<{ index: number; value: string }>;
}

export interface WhatsAppResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function buildComponents(p: WhatsAppTemplatePayload): unknown[] {
  const components: unknown[] = [];

  if (p.headerVariables && p.headerVariables.length > 0) {
    components.push({
      type: "header",
      parameters: p.headerVariables.map((v) => ({ type: "text", text: v })),
    });
  }
  if (p.bodyVariables && p.bodyVariables.length > 0) {
    components.push({
      type: "body",
      parameters: p.bodyVariables.map((v) => ({ type: "text", text: v })),
    });
  }
  if (p.buttonUrls && p.buttonUrls.length > 0) {
    for (const btn of p.buttonUrls) {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(btn.index),
        parameters: [{ type: "text", text: btn.value }],
      });
    }
  }
  return components;
}

export async function sendWhatsAppTemplate(
  payload: WhatsAppTemplatePayload,
  accessToken?: string,
): Promise<WhatsAppResult> {
  const token = accessToken || process.env.WHATSAPP_SYSTEM_TOKEN;
  const phoneNumberId = payload.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token) return { ok: false, error: "WHATSAPP_SYSTEM_TOKEN not configured" };
  if (!phoneNumberId) return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID not configured" };
  if (!payload.to) return { ok: false, error: "recipient (to) required" };
  if (!payload.templateName) return { ok: false, error: "templateName required" };

  const body = {
    messaging_product: "whatsapp",
    to: payload.to,
    type: "template",
    template: {
      name: payload.templateName,
      language: { code: payload.languageCode || "es" },
      components: buildComponents(payload),
    },
  };

  const url = `https://graph.facebook.com/${WA_VERSION}/${phoneNumberId}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string; code?: number };
    };
    if (!res.ok || json.error) {
      const err = json.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    const messageId = json.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("aborted") ? "timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}
