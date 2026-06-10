import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { findReusableConversation } from "@/lib/smarttalk/conversation-dedupe";
import type { MessageContent, MessageType } from "@/types/database";

type MetaChannelKind = "facebook" | "messenger" | "instagram";

type MetaWebhookEntry = {
  id?: string;
  time?: number;
  messaging?: MetaMessagingEvent[];
  changes?: Array<{
    field?: string;
    value?: MetaWebhookChangeValue;
  }>;
};

type MetaWebhookPayload = {
  object?: string;
  entry?: MetaWebhookEntry[];
  sample?: {
    field?: string;
    value?: MetaMessagingEvent;
  };
};

type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number | string;
  message?: MetaMessagePayload;
  postback?: { title?: string; payload?: string };
  delivery?: { mids?: string[] };
  read?: { watermark?: string };
  is_echo?: boolean;
};

type MetaWebhookChangeValue = {
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

type ContactIdentity = {
  name: string | null;
  profile_picture_url: string | null;
};

type MessengerProfileResponse = {
  first_name?: string;
  last_name?: string;
  profile_pic?: string;
  error?: {
    message?: string;
  };
};

type MessengerConversationResponse = {
  data?: Array<{
    participants?: {
      data?: Array<{
        id?: string;
        name?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type MetaMessagePayload = {
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

type SmarttalkChannel = {
  id: string;
  organization_id: string;
  type: string;
  name: string;
  status: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_phone_number: string | null;
  access_token: string | null;
  facebook_app_id: string | null;
  meta_business_id: string | null;
  config: Record<string, unknown>;
  connected_at: string | null;
  last_active_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

function getVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN || "";
}

function normalizeId(value: string | null | undefined) {
  return (value || "").trim();
}

function pickChannelCandidates(entry: MetaWebhookEntry, value?: MetaWebhookChangeValue) {
  const candidates = new Set<string>();
  if (entry.id) candidates.add(entry.id);
  if (value?.metadata?.page_id) candidates.add(value.metadata.page_id);
  if (value?.metadata?.account_id) candidates.add(value.metadata.account_id);
  if (value?.metadata?.phone_number_id) candidates.add(value.metadata.phone_number_id);
  return [...candidates].filter(Boolean);
}

function resolveChannelType(channel: MetaChannelKind) {
  return channel === "instagram" ? "instagram" : "facebook_messenger";
}

function extractContactId(event: MetaMessagingEvent, value?: MetaWebhookChangeValue) {
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

function getMessageDirection(event: MetaMessagingEvent, message?: MetaMessagePayload) {
  return event.is_echo || message?.is_echo ? "outbound" : "inbound";
}

function extractContactName(event: MetaMessagingEvent, value?: MetaWebhookChangeValue) {
  return value?.contacts?.[0]?.profile?.name || null;
}

function buildDisplayName(firstName?: string, lastName?: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function looksLikeAudio(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith("audio/") ||
    normalized.includes("audio") ||
    /\.(aac|aif|aiff|amr|m4a|mp3|oga|ogg|opus|wav|weba|webm)(\?|#|$)/.test(normalized)
  );
}

async function fetchMessengerProfile(pageToken: string, psid: string): Promise<ContactIdentity | null> {
  const metaVersion = process.env.META_GRAPH_VERSION || "v21.0";
  const fields = "first_name,last_name,profile_pic";
  const url = `https://graph.facebook.com/${metaVersion}/${encodeURIComponent(psid)}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`;

  const response = await fetch(url);
  const data = (await response.json()) as MessengerProfileResponse;

  if (!response.ok || data.error) {
    console.warn("[meta-webhook] messenger profile lookup failed", {
      psid,
      error: data.error?.message || `HTTP ${response.status}`,
    });
    return null;
  }

  return {
    name: buildDisplayName(data.first_name, data.last_name),
    profile_picture_url: data.profile_pic || null,
  };
}

async function fetchMessengerParticipantIdentity(
  pageId: string,
  pageToken: string,
  psid: string
): Promise<ContactIdentity | null> {
  const metaVersion = process.env.META_GRAPH_VERSION || "v21.0";
  const fields = "participants{id,name}";
  const url = `https://graph.facebook.com/${metaVersion}/${encodeURIComponent(pageId)}/conversations?fields=${fields}&limit=100&access_token=${encodeURIComponent(pageToken)}`;

  const response = await fetch(url);
  const data = (await response.json()) as MessengerConversationResponse;

  if (!response.ok || data.error) {
    console.warn("[meta-webhook] messenger conversations lookup failed", {
      pageId,
      psid,
      error: data.error?.message || `HTTP ${response.status}`,
    });
    return null;
  }

  const conversation = data.data?.find((item) =>
    item.participants?.data?.some((participant) => participant.id === psid)
  );

  const participant = conversation?.participants?.data?.find((entry) => entry.id === psid);
  if (!participant?.name) {
    return null;
  }

  return {
    name: participant.name,
    profile_picture_url: null,
  };
}

function parseMetaMessage(message: MetaMessagePayload): { type: MessageType; content: MessageContent } {
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

function normalizeChannelKind(channel: MetaChannelKind) {
  return channel === "instagram" ? "instagram" : "facebook_messenger";
}

async function findMatchingChannel(
  channelKind: MetaChannelKind,
  candidates: string[]
): Promise<SmarttalkChannel | null> {
  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("channels")
    .select("*")
    .eq("status", "active")
    .eq("type", normalizeChannelKind(channelKind));

  if (error) {
    console.error("[meta-webhook] error consultando channels", error.message);
    return null;
  }

  const channels = (data || []) as SmarttalkChannel[];
  for (const channel of channels) {
    const config = (channel.config || {}) as Record<string, unknown>;
    const legacyId = typeof config.legacy_id === "string" ? config.legacy_id : null;
    const metaIds = [
      channel.meta_business_id,
      channel.whatsapp_business_account_id,
      channel.whatsapp_phone_number_id,
      legacyId,
    ]
      .filter(Boolean)
      .map((value) => normalizeId(value as string));

    if (candidates.some((candidate) => metaIds.includes(normalizeId(candidate)))) {
      return channel;
    }
  }
  return null;
}

async function upsertContactAndConversation(
  channel: SmarttalkChannel,
  contactId: string,
  contactIdentity: ContactIdentity
) {
  const admin = createAdminClient("smarttalk");
  const { data: existingContact } = await admin
    .from("contacts")
    .select("id, name, profile_picture_url")
    .eq("organization_id", channel.organization_id)
    .eq("wa_id", contactId)
    .maybeSingle();

  let dbContactId = existingContact?.id as string | undefined;

  if (!dbContactId) {
    const { data: inserted, error } = await admin
      .from("contacts")
      .insert({
        organization_id: channel.organization_id,
        wa_id: contactId,
        name: contactIdentity.name,
        profile_picture_url: contactIdentity.profile_picture_url,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    dbContactId = inserted?.id as string | undefined;
  } else {
    const updates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
    };

    if (contactIdentity.name && contactIdentity.name !== existingContact?.name) {
      updates.name = contactIdentity.name;
    }

    if (
      contactIdentity.profile_picture_url &&
      contactIdentity.profile_picture_url !== existingContact?.profile_picture_url
    ) {
      updates.profile_picture_url = contactIdentity.profile_picture_url;
    }

    await admin
      .from("contacts")
      .update(updates)
      .eq("id", dbContactId);
  }

  if (!dbContactId) {
    throw new Error("Could not upsert Meta contact");
  }

  const reusableConversation = await findReusableConversation({
    organizationId: channel.organization_id,
    contactId: dbContactId,
    channelId: channel.id,
    metadataPatch: {
      channel: channel.type,
      channel_id: channel.id,
      source: channel.type,
    },
  });

  let conversationId = reusableConversation?.id;
  let unreadCount = reusableConversation?.unreadCount ?? 0;

  if (!conversationId) {
    const { data: inserted, error } = await admin
      .from("conversations")
      .insert({
        organization_id: channel.organization_id,
        contact_id: dbContactId,
        channel_id: channel.id,
        status: "open",
        metadata: {
          channel: channel.type,
          channel_id: channel.id,
          source: channel.type,
        },
      })
      .select("id, unread_count")
      .single();
    if (error) throw error;
    conversationId = inserted?.id as string | undefined;
    unreadCount = inserted?.unread_count ?? 0;

    const mergedConversation = await findReusableConversation({
      organizationId: channel.organization_id,
      contactId: dbContactId,
      channelId: channel.id,
      metadataPatch: {
        channel: channel.type,
        channel_id: channel.id,
        source: channel.type,
      },
    });

    conversationId = mergedConversation?.id || conversationId;
    unreadCount = mergedConversation?.unreadCount ?? unreadCount;
  }

  if (!conversationId) {
    throw new Error("Could not upsert Meta conversation");
  }

  return { dbContactId, conversationId, unreadCount };
}

async function persistMessengerLikeWebhook(channelKind: MetaChannelKind, payload: MetaWebhookPayload) {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const admin = createAdminClient("smarttalk");
  let processed = 0;
  const contactProfileCache = new Map<string, ContactIdentity | null>();

  async function resolveContactIdentity(
    channel: SmarttalkChannel,
    contactId: string,
    fallbackName: string | null
  ): Promise<ContactIdentity> {
    if (contactProfileCache.has(contactId)) {
      const cached = contactProfileCache.get(contactId);
      return {
        name: cached?.name || fallbackName,
        profile_picture_url: cached?.profile_picture_url || null,
      };
    }

    let profile: ContactIdentity | null = null;
    if (channel.type === "facebook_messenger" && channel.access_token) {
      profile = await fetchMessengerProfile(channel.access_token, contactId);
      if (!profile && channel.meta_business_id) {
        profile = await fetchMessengerParticipantIdentity(
          channel.meta_business_id,
          channel.access_token,
          contactId
        );
      }
    }

    contactProfileCache.set(contactId, profile);

    return {
      name: profile?.name || fallbackName,
      profile_picture_url: profile?.profile_picture_url || null,
    };
  }

  for (const entry of entries) {
    for (const event of entry.messaging || []) {
      const candidates = pickChannelCandidates(entry);
      const channel = await findMatchingChannel(channelKind, candidates);
      if (!channel) {
        console.warn("[meta-webhook] no matching smarttalk channel", {
          channelKind,
          candidates,
        });
        continue;
      }

      await admin
        .from("channels")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", channel.id);

      const payloadMessage = event.message || (event.postback
        ? {
            mid: randomUUID(),
            from: event.sender?.id,
            postback: event.postback,
          }
        : null);

      if (!payloadMessage) continue;

      const contactId = extractContactId(event);
      const contactName = extractContactName(event);
      const contactIdentity = await resolveContactIdentity(channel, contactId, contactName);
      const { dbContactId, conversationId, unreadCount } = await upsertContactAndConversation(
        channel,
        contactId,
        contactIdentity
      );

      const parsed = parseMetaMessage(payloadMessage);
      const direction = getMessageDirection(event, payloadMessage);
      const providerMessageId = payloadMessage.mid || payloadMessage.id || randomUUID();
      const preview = parsed.content.type === "text"
        ? parsed.content.text.slice(0, 100)
        : `[${parsed.type}]`;

      const { data: existingMessage, error: existingMessageError } = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("wa_message_id", providerMessageId)
        .maybeSingle();

      if (existingMessageError) {
        console.error("[meta-webhook] error consultando mensaje existente", existingMessageError.message);
        continue;
      }

      if (existingMessage?.id) {
        await admin
          .from("conversations")
          .update({
            unread_count: direction === "outbound" ? 0 : unreadCount,
            last_message_preview: preview,
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
        continue;
      }

      const { error: messageError } = await admin.from("messages").insert({
        conversation_id: conversationId,
        contact_id: dbContactId,
        direction,
        type: parsed.type,
        content: parsed.content,
        wa_message_id: providerMessageId,
        status: direction === "outbound" ? "sent" : "delivered",
        is_bot: false,
      });

      if (messageError) {
        console.error("[meta-webhook] error guardando mensaje", messageError.message);
        continue;
      }

      await admin
        .from("conversations")
        .update({
          unread_count: direction === "outbound" ? 0 : unreadCount + 1,
          last_message_preview: preview,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      processed += 1;
    }

    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      const candidates = pickChannelCandidates(entry, value);
      const channel = await findMatchingChannel(channelKind, candidates);
      if (!channel) {
        console.warn("[meta-webhook] no matching smarttalk channel", {
          channelKind,
          candidates,
        });
        continue;
      }

      await admin
        .from("channels")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", channel.id);

      const messages = value.messages || [];
      for (const message of messages) {
        const contactId = extractContactId(
          { sender: { id: message.from }, recipient: { id: entry.id }, message },
          value
        );
        const contactName = extractContactName(
          { sender: { id: message.from }, recipient: { id: entry.id }, message },
          value
        );
        const contactIdentity = await resolveContactIdentity(channel, contactId, contactName);
        const { dbContactId, conversationId, unreadCount } = await upsertContactAndConversation(
          channel,
          contactId,
          contactIdentity
        );

        const parsed = parseMetaMessage(message);
        const preview = parsed.content.type === "text"
          ? parsed.content.text.slice(0, 100)
          : `[${parsed.type}]`;

        const { error: messageError } = await admin.from("messages").insert({
          conversation_id: conversationId,
          contact_id: dbContactId,
          direction: message.is_echo ? "outbound" : "inbound",
          type: parsed.type,
          content: parsed.content,
          wa_message_id: message.mid || message.id || randomUUID(),
          status: message.is_echo ? "sent" : "delivered",
          is_bot: false,
        });

        if (messageError) {
          console.error("[meta-webhook] error guardando mensaje", messageError.message);
          continue;
        }

        await admin
          .from("conversations")
          .update({
            unread_count: message.is_echo ? 0 : unreadCount + 1,
            last_message_preview: preview,
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        processed += 1;
      }

      const statuses = value.statuses || [];
      for (const status of statuses) {
        if (!status.id) continue;
        await admin
          .from("messages")
          .update({ status: status.status === "read" ? "read" : "delivered" })
          .eq("wa_message_id", status.id);
      }
    }
  }

  return processed;
}

export function verifyMetaWebhook(request: NextRequest, channel: "whatsapp" | "messenger" | "facebook" | "instagram") {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode !== "subscribe") {
    return NextResponse.json(
      { error: "hub.mode invalido", expected: "subscribe", channel },
      { status: 400 }
    );
  }

  if (!token || token !== getVerifyToken()) {
    return NextResponse.json(
      { error: "hub.verify_token invalido", channel },
      { status: 403 }
    );
  }

  if (!challenge) {
    return NextResponse.json(
      { error: "hub.challenge requerido", channel },
      { status: 400 }
    );
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function receiveMetaWebhook(
  request: NextRequest,
  channel: "whatsapp" | "messenger" | "facebook" | "instagram"
) {
  let payload: MetaWebhookPayload;

  try {
    payload = (await request.json()) as MetaWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "JSON invalido", channel },
      { status: 400 }
    );
  }

  console.log(`[meta-webhook:${channel}]`, JSON.stringify(payload));

  if (payload.sample) {
    console.log(`[meta-webhook-test:${channel}]`, {
      field: payload.sample.field || "unknown",
      sender: payload.sample.value?.sender?.id || "n/a",
      recipient: payload.sample.value?.recipient?.id || "n/a",
    });
    return NextResponse.json({
      received: true,
      channel,
      testPayload: true,
      processed: 0,
    });
  }

  if (channel === "whatsapp") {
    return NextResponse.json({ received: true, channel });
  }

  const processed = await persistMessengerLikeWebhook(channel, payload);
  return NextResponse.json({
    received: true,
    channel,
    processed,
  });
}
