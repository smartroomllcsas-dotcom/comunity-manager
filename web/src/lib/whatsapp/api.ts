import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken } from "@/lib/auth/token-crypto";

const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const WA_API_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

async function callWhatsAppAPI(phoneNumberId: string, accessToken: string, payload: Record<string, unknown>): Promise<{ messages: { id: string }[] }> {
  const response = await fetch(`${WA_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`WhatsApp API error: ${JSON.stringify(error.error || error)}`);
  }
  return response.json();
}

export async function sendText({ to, text, phoneNumberId, accessToken }: { to: string; text: string; phoneNumberId: string; accessToken: string }) {
  return callWhatsAppAPI(phoneNumberId, accessToken, { to, type: "text", text: { body: text } });
}

export async function sendTemplate({ to, templateName, language, components, phoneNumberId, accessToken }: { to: string; templateName: string; language: string; components?: unknown[]; phoneNumberId: string; accessToken: string }) {
  return callWhatsAppAPI(phoneNumberId, accessToken, { to, type: "template", template: { name: templateName, language: { code: language }, components: components || [] } });
}

export async function sendMedia({ to, type, mediaUrl, caption, filename, phoneNumberId, accessToken }: { to: string; type: "image" | "video" | "audio" | "document"; mediaUrl: string; caption?: string; filename?: string; phoneNumberId: string; accessToken: string }) {
  const mediaPayload: Record<string, unknown> = { link: mediaUrl };
  if (caption) mediaPayload.caption = caption;
  if (filename) mediaPayload.filename = filename;
  return callWhatsAppAPI(phoneNumberId, accessToken, { to, type, [type]: mediaPayload });
}

export async function sendInteractive({ to, interactiveType, body, buttons, sections, phoneNumberId, accessToken }: { to: string; interactiveType: "button" | "list"; body: string; buttons?: { id: string; title: string }[]; sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[]; phoneNumberId: string; accessToken: string }) {
  const interactive: Record<string, unknown> = { type: interactiveType, body: { text: body } };
  if (interactiveType === "button" && buttons) {
    interactive.action = { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) };
  }
  if (interactiveType === "list" && sections) {
    interactive.action = { button: "Ver opciones", sections };
  }
  return callWhatsAppAPI(phoneNumberId, accessToken, { to, type: "interactive", interactive });
}

export async function getChannelCredentials(channelId: string) {
  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("whatsapp_phone_number_id, access_token, access_token_ciphertext")
    .eq("id", channelId)
    .eq("status", "active")
    .single();
  const token = resolveToken(channel?.access_token_ciphertext, channel?.access_token);
  if (!channel?.whatsapp_phone_number_id || !token) {
    throw new Error("Channel not configured or inactive");
  }
  return { phoneNumberId: channel.whatsapp_phone_number_id, accessToken: token };
}

export async function getOrgWhatsAppCredentials(organizationId: string, channelId?: string) {
  // If a channelId is provided, use it directly
  if (channelId) {
    return getChannelCredentials(channelId);
  }

  // Fallback: try the org's first active WhatsApp channel
  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("whatsapp_phone_number_id, access_token, access_token_ciphertext")
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const channelToken = resolveToken(channel?.access_token_ciphertext, channel?.access_token);
  if (channel?.whatsapp_phone_number_id && channelToken) {
    return { phoneNumberId: channel.whatsapp_phone_number_id, accessToken: channelToken };
  }

  // Legacy fallback: read from organizations table (soporta ciphertext post-Sprint4).
  const { data: org } = await admin
    .from("organizations")
    .select("whatsapp_phone_number_id, access_token, access_token_ciphertext")
    .eq("id", organizationId)
    .single();
  const orgToken = resolveToken(org?.access_token_ciphertext, org?.access_token);
  if (!org?.whatsapp_phone_number_id || !orgToken) {
    throw new Error("WhatsApp not configured for this organization");
  }
  return { phoneNumberId: org.whatsapp_phone_number_id, accessToken: orgToken };
}
