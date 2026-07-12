import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { findReusableConversation } from "@/lib/smarttalk/conversation-dedupe";
import { resolveToken } from "@/lib/auth/token-crypto";
import {
  buildDisplayName,
  extractContactId,
  extractContactName,
  getMessageDirection,
  normalizeChannelKind,
  normalizeId,
  parseMetaMessage,
  pickChannelCandidates,
  type MetaChannelKind,
  type MetaMessagePayload,
  type MetaMessagingEvent,
  type MetaWebhookChangeValue,
  type MetaWebhookEntry,
  type MetaWebhookPayload,
} from "@/lib/smarttalk/meta-parser";

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
  access_token_ciphertext: string | null;
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

function getMetaAppSecret(channel: "whatsapp" | "messenger" | "facebook" | "instagram") {
  if (channel === "whatsapp") {
    return process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "";
  }
  if (channel === "instagram") {
    return process.env.META_IG_APP_SECRET || process.env.META_APP_SECRET || "";
  }
  return process.env.META_APP_SECRET || "";
}

function safeEqualStrings(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader) return false;
  if (!appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqualStrings(signatureHeader, expected);
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
    const channelToken = resolveToken(channel.access_token_ciphertext, channel.access_token);
    if (channel.type === "facebook_messenger" && channelToken) {
      profile = await fetchMessengerProfile(channelToken, contactId);
      if (!profile && channel.meta_business_id) {
        profile = await fetchMessengerParticipantIdentity(
          channel.meta_business_id,
          channelToken,
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

      // UNIQUE(conversation_id, wa_message_id) respalda la idempotencia:
      // ignoreDuplicates→ INSERT ... ON CONFLICT DO NOTHING; array vacío = duplicado.
      const { data: insertedMessage, error: messageError } = await admin
        .from("messages")
        .upsert(
          {
            conversation_id: conversationId,
            contact_id: dbContactId,
            direction,
            type: parsed.type,
            content: parsed.content,
            wa_message_id: providerMessageId,
            status: direction === "outbound" ? "sent" : "delivered",
            is_bot: false,
          },
          { onConflict: "conversation_id,wa_message_id", ignoreDuplicates: true }
        )
        .select("id");

      if (messageError) {
        console.error("[meta-webhook] error guardando mensaje", messageError.message);
        continue;
      }

      const isDuplicate = !insertedMessage || insertedMessage.length === 0;

      await admin
        .from("conversations")
        .update({
          unread_count:
            direction === "outbound"
              ? 0
              : isDuplicate
                ? unreadCount
                : unreadCount + 1,
          last_message_preview: preview,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      if (!isDuplicate) processed += 1;
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

        const waMessageId = message.mid || message.id || randomUUID();
        const { data: insertedMessage, error: messageError } = await admin
          .from("messages")
          .upsert(
            {
              conversation_id: conversationId,
              contact_id: dbContactId,
              direction: message.is_echo ? "outbound" : "inbound",
              type: parsed.type,
              content: parsed.content,
              wa_message_id: waMessageId,
              status: message.is_echo ? "sent" : "delivered",
              is_bot: false,
            },
            { onConflict: "conversation_id,wa_message_id", ignoreDuplicates: true }
          )
          .select("id");

        if (messageError) {
          console.error("[meta-webhook] error guardando mensaje", messageError.message);
          continue;
        }

        const isDuplicate = !insertedMessage || insertedMessage.length === 0;

        await admin
          .from("conversations")
          .update({
            unread_count:
              message.is_echo
                ? 0
                : isDuplicate
                  ? unreadCount
                  : unreadCount + 1,
            last_message_preview: preview,
            status: "open",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        if (!isDuplicate) processed += 1;
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

  const expectedToken = getVerifyToken();
  if (!token || !expectedToken || !safeEqualStrings(token, expectedToken)) {
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
  const appSecret = getMetaAppSecret(channel);
  if (!appSecret) {
    console.error(`[meta-webhook:${channel}] app secret no configurado`);
    return NextResponse.json(
      { error: "Webhook security not configured", channel },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    return NextResponse.json(
      { error: "Invalid signature", channel },
      { status: 401 }
    );
  }

  let payload: MetaWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "JSON invalido", channel },
      { status: 400 }
    );
  }

  console.log(`[meta-webhook:${channel}]`, {
    entries: Array.isArray(payload.entry) ? payload.entry.length : 0,
    hasSample: Boolean(payload.sample),
  });

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

  // Desacople: Meta requiere 200 en <20s. Procesamos en background con `after`
  // para responder inmediatamente y evitar timeouts / desuscripciones.
  after(async () => {
    try {
      await persistMessengerLikeWebhook(channel, payload);
    } catch (err) {
      console.error(`[meta-webhook:${channel}] background processing failed`, err);
    }
  });

  return NextResponse.json({ received: true, channel, queued: true });
}
