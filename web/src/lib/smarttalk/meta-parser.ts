// Funciones puras de parseo de payloads Meta (FB/IG/Messenger).
// Aisladas del acceso a DB para permitir tests unitarios rápidos.
import type { MessageContent, MessageType } from "@/types/database";

export type MetaChannelKind = "facebook" | "messenger" | "instagram";

export type MetaWebhookEntry = {
  id?: string;
  time?: number;
  messaging?: MetaMessagingEvent[];
  changes?: Array<{
    field?: string;
    value?: MetaWebhookChangeValue;
  }>;
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: MetaWebhookEntry[];
  sample?: {
    field?: string;
    value?: MetaMessagingEvent;
  };
};

export type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number | string;
  message?: MetaMessagePayload;
  postback?: { title?: string; payload?: string };
  delivery?: { mids?: string[] };
  read?: { watermark?: string };
  is_echo?: boolean;
};

export type MetaWebhookChangeValue = {
  messaging_product?: string;
  metadata?: {
    page_id?: string;
    account_id?: string;
    phone_number_id?: string;
  };
  messages?: MetaMessagePayload[];
  statuses?: Array<{
    id?: string;
    status?: string;
    timestamp?: string;
    recipient_id?: string;
  }>;
  contacts?: Array<{
    wa_id?: string;
    profile?: { name?: string };
  }>;
};

export type MetaMessagePayload = {
  mid?: string;
  id?: string;
  from?: string;
  text?: string | { body?: string };
  message?: { text?: string };
  postback?: { title?: string; payload?: string };
  attachments?: Array<{
    type?: string;
    payload?: {
      url?: string;
    };
    name?: string;
    mime_type?: string;
  }>;
  attachment?: {
    type?: string;
    payload?: {
      url?: string;
    };
    name?: string;
    mime_type?: string;
  };
  image?: { caption?: string };
  video?: { caption?: string };
  audio?: unknown;
  file?: { name?: string; caption?: string; url?: string };
  sticker?: unknown;
  quick_reply?: { payload?: string };
  is_echo?: boolean;
};

export function normalizeId(value: string | null | undefined) {
  return (value || "").trim();
}

export function pickChannelCandidates(entry: MetaWebhookEntry, value?: MetaWebhookChangeValue) {
  const candidates = new Set<string>();
  if (entry.id) candidates.add(entry.id);
  if (value?.metadata?.page_id) candidates.add(value.metadata.page_id);
  if (value?.metadata?.account_id) candidates.add(value.metadata.account_id);
  if (value?.metadata?.phone_number_id) candidates.add(value.metadata.phone_number_id);
  return [...candidates].filter(Boolean);
}

export function resolveChannelType(channel: MetaChannelKind) {
  return channel === "instagram" ? "instagram" : "facebook_messenger";
}

export function normalizeChannelKind(channel: MetaChannelKind) {
  return channel === "instagram" ? "instagram" : "facebook_messenger";
}

export function extractContactId(event: MetaMessagingEvent, value?: MetaWebhookChangeValue) {
  if (event.message?.is_echo || event.is_echo) {
    return event.recipient?.id || event.sender?.id || "unknown";
  }

  return (
    event.sender?.id ||
    value?.contacts?.[0]?.wa_id ||
    value?.metadata?.account_id ||
    value?.metadata?.page_id ||
    "unknown"
  );
}

export function getMessageDirection(event: MetaMessagingEvent, message?: MetaMessagePayload) {
  return event.is_echo || message?.is_echo ? "outbound" : "inbound";
}

export function extractContactName(event: MetaMessagingEvent, value?: MetaWebhookChangeValue) {
  void event;
  return value?.contacts?.[0]?.profile?.name || null;
}

export function buildDisplayName(firstName?: string, lastName?: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

export function looksLikeAudio(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith("audio/") ||
    normalized.includes("audio") ||
    /\.(aac|aif|aiff|amr|m4a|mp3|oga|ogg|opus|wav|weba|webm)(\?|#|$)/.test(normalized)
  );
}

export function parseMetaMessage(message: MetaMessagePayload): { type: MessageType; content: MessageContent } {
  const directText = typeof message.text === "string"
    ? message.text
    : message.text?.body;

  if (directText || message.message?.text || message.quick_reply?.payload) {
    return {
      type: "text",
      content: {
        type: "text",
        text:
          directText ||
          message.message?.text ||
          message.quick_reply?.payload ||
          "",
      },
    };
  }

  const attachment = message.attachment || message.attachments?.[0];
  const url = attachment?.payload?.url || message.file?.url || message.mid || message.id || "";
  const type = (attachment?.type || "document").toLowerCase();
  const fileName = attachment?.name || message.file?.name || "";
  const mimeType = attachment?.mime_type || "";

  if (type === "image") {
    return { type: "image", content: { type: "image", url, caption: message.image?.caption } };
  }
  if (type === "video") {
    return { type: "video", content: { type: "video", url, caption: message.video?.caption } };
  }
  if (type === "audio" || looksLikeAudio(mimeType) || looksLikeAudio(fileName) || looksLikeAudio(url)) {
    return { type: "audio", content: { type: "audio", url } };
  }
  if (type === "sticker") {
    return { type: "sticker", content: { type: "sticker", url } };
  }

  return {
    type: "document",
    content: {
      type: "document",
      url,
      filename: message.file?.name || "archivo",
      caption: message.file?.caption,
    },
  };
}
