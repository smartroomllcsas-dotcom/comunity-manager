/**
 * Emisor de mensajes salientes agnóstico al canal, para que el agente IA
 * pueda responder por WhatsApp, Messenger o Instagram con la misma interfaz.
 *
 * WhatsApp  → Cloud API (phone_number_id + token)
 * Messenger → Graph /me/messages con el page token del canal
 * Instagram → Graph /me/messages (mismo endpoint) con el token del canal
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken } from "@/lib/auth/token-crypto";
import { sendText as waSendText, sendMedia as waSendMedia } from "@/lib/whatsapp/api";
import { sendMetaTextMessage, sendMetaAttachment } from "@/lib/meta";

export type OutboundSender = {
  channelType: string;
  sendText: (to: string, text: string) => Promise<unknown>;
  sendMedia: (
    to: string,
    kind: "document" | "image",
    url: string,
    filename?: string
  ) => Promise<unknown>;
};

/**
 * Resuelve cómo enviar por el canal dado. Devuelve null si el canal no existe
 * o no tiene credenciales usables.
 */
export async function getOutboundSender(
  channelId: string
): Promise<OutboundSender | null> {
  const admin = createAdminClient("smarttalk");
  const { data: channel } = await admin
    .from("channels")
    .select("type, whatsapp_phone_number_id, access_token, access_token_ciphertext")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return null;

  const token = resolveToken(channel.access_token_ciphertext, channel.access_token);
  if (!token) return null;

  if (channel.type === "facebook_messenger" || channel.type === "instagram") {
    return {
      channelType: channel.type,
      sendText: (to, text) => sendMetaTextMessage(token, to, text),
      sendMedia: (to, kind, url) =>
        sendMetaAttachment(token, to, kind === "document" ? "file" : "image", url),
    };
  }

  // WhatsApp Cloud (default)
  if (!channel.whatsapp_phone_number_id) return null;
  const phoneNumberId = channel.whatsapp_phone_number_id;
  return {
    channelType: channel.type,
    sendText: (to, text) =>
      waSendText({ to, text, phoneNumberId, accessToken: token }),
    sendMedia: (to, kind, url, filename) =>
      waSendMedia({
        to,
        type: kind,
        mediaUrl: url,
        filename: kind === "document" ? filename : undefined,
        caption: kind === "image" ? "📄 Te comparto nuestro catálogo" : undefined,
        phoneNumberId,
        accessToken: token,
      }),
  };
}
