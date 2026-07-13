import { createAdminClient } from "@/lib/supabase/admin";
import { findReusableConversation } from "@/lib/smarttalk/conversation-dedupe";
import { resolveToken } from "@/lib/auth/token-crypto";
import type { MessageContent, MessageType } from "@/types/database";

type SmarttalkChannel = {
  id: string;
  organization_id: string;
  type: string;
  name: string;
  status: string;
  access_token: string | null;
  access_token_ciphertext: string | null;
  config: Record<string, unknown> | null;
  last_active_at: string | null;
};

type LegacySocialAccount = {
  id: string;
  page_id: string | null;
  page_access_token: string | null;
  page_access_token_ciphertext: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
};

type InstagramParticipant = {
  id?: string;
  username?: string;
};

type InstagramConversation = {
  id: string;
  updated_time?: string;
  participants?: {
    data?: InstagramParticipant[];
  };
};

type InstagramMessage = {
  id: string;
  message?: string;
  created_time?: string;
  from?: InstagramParticipant;
  to?: {
    data?: InstagramParticipant[];
  };
  attachments?: {
    data?: Array<{
      audio_data?: { url?: string };
      image_data?: { url?: string };
      video_data?: { url?: string };
      file_url?: string;
      mime_type?: string;
      name?: string;
    }>;
  };
  sticker?: {
    url?: string;
  };
};

type GraphResponse<T> = {
  data?: T[];
  paging?: {
    next?: string;
    cursors?: { before?: string; after?: string };
  };
  error?: {
    message?: string;
  };
};

type SyncResult = {
  channels: number;
  conversations: number;
  insertedMessages: number;
  skippedMessages: number;
  errors: string[];
};

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GRAPH_TIMEOUT_MS = 20_000;
const CONVERSATION_LIMIT = 10;
const MESSAGE_LIMIT = 25;
const MESSAGE_MAX_PAGES = 4; // hasta 100 mensajes por conversación por sync

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function graphGet<T>(path: string, accessToken: string): Promise<GraphResponse<T>> {
  const isFullUrl = path.startsWith("https://");
  const separator = path.includes("?") ? "&" : "?";
  const url = isFullUrl
    ? (path.includes("access_token=") ? path : `${path}${separator}access_token=${encodeURIComponent(accessToken)}`)
    : `${GRAPH_URL}/${path}${separator}access_token=${encodeURIComponent(accessToken)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const data = (await response.json().catch(() => ({}))) as GraphResponse<T>;

    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || JSON.stringify(data.error || data) || "An unknown error occurred";
      throw new Error(`Meta Graph ${response.status}: ${errorMessage}`);
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Meta Graph timeout after ${GRAPH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function graphGetPaginated<T>(
  path: string,
  accessToken: string,
  maxPages: number
): Promise<T[]> {
  const collected: T[] = [];
  let nextPath: string | null = path;
  for (let page = 0; page < maxPages && nextPath; page++) {
    const response: GraphResponse<T> = await graphGet<T>(nextPath, accessToken);
    if (response.error) {
      throw new Error(`Meta Graph paging error: ${response.error.message || "unknown"}`);
    }
    if (Array.isArray(response.data)) collected.push(...response.data);
    nextPath = response.paging?.next || null;
  }
  return collected;
}

function pickInstagramContact(
  conversation: InstagramConversation,
  businessInstagramId: string
) {
  return conversation.participants?.data?.find(
    (participant) => participant.id && participant.id !== businessInstagramId
  ) || null;
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

function parseInstagramMessage(message: InstagramMessage): { type: MessageType; content: MessageContent } | null {
  if (message.message) {
    return {
      type: "text",
      content: {
        type: "text",
        text: message.message,
      },
    };
  }

  if (message.sticker?.url) {
    return {
      type: "sticker",
      content: {
        type: "sticker",
        url: message.sticker.url,
      },
    };
  }

  const attachment = message.attachments?.data?.[0];
  if (attachment?.audio_data?.url) {
    return {
      type: "audio",
      content: {
        type: "audio",
        url: attachment.audio_data.url,
      },
    };
  }

  if (attachment?.image_data?.url) {
    return {
      type: "image",
      content: {
        type: "image",
        url: attachment.image_data.url,
      },
    };
  }

  if (attachment?.video_data?.url) {
    return {
      type: "video",
      content: {
        type: "video",
        url: attachment.video_data.url,
      },
    };
  }

  if (attachment?.file_url) {
    const type: MessageType = looksLikeAudio(attachment.mime_type) ||
      looksLikeAudio(attachment.name) ||
      looksLikeAudio(attachment.file_url)
      ? "audio"
      : "document";
    return {
      type,
      content: type === "audio"
        ? { type: "audio", url: attachment.file_url }
        : { type: "document", url: attachment.file_url, filename: attachment.name || "archivo" },
    };
  }

  return null;
}

async function getLegacySocialAccount(channel: SmarttalkChannel) {
  const publicAdmin = createAdminClient("public");
  const legacyAccountId = stringValue(channel.config?.legacy_account_id);
  const legacyInstagramId = stringValue(channel.config?.legacy_id);

  let query = publicAdmin
    .from("cm_social_accounts")
    .select("id,page_id,page_access_token,page_access_token_ciphertext,instagram_id,instagram_username")
    .not("instagram_id", "is", null);

  if (legacyAccountId) {
    query = query.eq("id", legacyAccountId);
  } else if (legacyInstagramId) {
    query = query.eq("instagram_id", legacyInstagramId);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as LegacySocialAccount | null;
}

async function upsertInstagramContact(
  channel: SmarttalkChannel,
  contact: InstagramParticipant,
  lastMessageAt: string
) {
  const admin = createAdminClient("smarttalk");
  const contactId = contact.id || contact.username;

  if (!contactId) {
    throw new Error("Instagram contact id missing");
  }

  const { data: existing } = await admin
    .from("contacts")
    .select("id,name")
    .eq("organization_id", channel.organization_id)
    .eq("wa_id", contactId)
    .maybeSingle();

  if (existing?.id) {
    const updates: Record<string, unknown> = {
      last_message_at: lastMessageAt,
    };
    if (contact.username && contact.username !== existing.name) {
      updates.name = contact.username;
    }

    await admin.from("contacts").update(updates).eq("id", existing.id);
    return existing.id as string;
  }

  const { data: inserted, error } = await admin
    .from("contacts")
    .insert({
      organization_id: channel.organization_id,
      wa_id: contactId,
      name: contact.username || contactId,
      last_message_at: lastMessageAt,
    })
    .select("id")
    .single();

  if (error) throw error;
  return inserted.id as string;
}

async function upsertInstagramConversation(
  channel: SmarttalkChannel,
  contactId: string,
  instagramConversationId: string,
  updatedAt: string
) {
  const admin = createAdminClient("smarttalk");
  const reusableConversation = await findReusableConversation({
    organizationId: channel.organization_id,
    contactId,
    channelId: channel.id,
    updatedAt,
    metadataPatch: {
      source: "instagram",
      channel: "instagram",
      instagram_conversation_id: instagramConversationId,
    },
  });

  if (reusableConversation?.id) return reusableConversation.id;

  const { data: inserted, error } = await admin
    .from("conversations")
    .insert({
      organization_id: channel.organization_id,
      contact_id: contactId,
      channel_id: channel.id,
      status: "open",
      priority: "medium",
      metadata: {
        source: "instagram",
        channel: "instagram",
        instagram_conversation_id: instagramConversationId,
      },
      updated_at: updatedAt,
    })
    .select("id")
    .single();

  if (error) throw error;

  const mergedConversation = await findReusableConversation({
    organizationId: channel.organization_id,
    contactId,
    channelId: channel.id,
    updatedAt,
    metadataPatch: {
      source: "instagram",
      channel: "instagram",
      instagram_conversation_id: instagramConversationId,
    },
  });

  return (mergedConversation?.id || inserted.id) as string;
}

export async function syncInstagramInboxForOrganization(organizationId: string): Promise<SyncResult> {
  const admin = createAdminClient("smarttalk");
  const result: SyncResult = {
    channels: 0,
    conversations: 0,
    insertedMessages: 0,
    skippedMessages: 0,
    errors: [],
  };

  const { data: channels, error: channelError } = await admin
    .from("channels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("type", "instagram")
    .eq("status", "active");

  if (channelError) {
    result.errors.push(channelError.message);
    return result;
  }

  for (const channel of (channels || []) as SmarttalkChannel[]) {
    result.channels += 1;

    try {
      const socialAccount = await getLegacySocialAccount(channel);
      const pageToken = resolveToken(
        socialAccount?.page_access_token_ciphertext,
        socialAccount?.page_access_token
      );
      if (!socialAccount?.page_id || !pageToken || !socialAccount.instagram_id) {
        result.errors.push(`Instagram channel ${channel.id} missing page/token/account mapping`);
        continue;
      }

      const conversations = await graphGet<InstagramConversation>(
        `${socialAccount.page_id}/conversations?platform=instagram&fields=id,updated_time,participants&limit=${CONVERSATION_LIMIT}`,
        pageToken
      );

      for (const conversation of conversations.data || []) {
        const externalContact = pickInstagramContact(conversation, socialAccount.instagram_id);
        if (!externalContact?.id) continue;

        const updatedAt = conversation.updated_time
          ? new Date(conversation.updated_time).toISOString()
          : new Date().toISOString();
        const contactId = await upsertInstagramContact(channel, externalContact, updatedAt);
        const conversationId = await upsertInstagramConversation(
          channel,
          contactId,
          conversation.id,
          updatedAt
        );

        result.conversations += 1;

        const messageRows = await graphGetPaginated<InstagramMessage>(
          `${encodeURIComponent(conversation.id)}/messages?fields=id,message,from,to,created_time,attachments,sticker&limit=${MESSAGE_LIMIT}`,
          pageToken,
          MESSAGE_MAX_PAGES
        );
        const messageIds = messageRows.map((message) => message.id).filter(Boolean);

        const { data: existingMessages } = messageIds.length
          ? await admin
              .from("messages")
              .select("wa_message_id")
              .eq("conversation_id", conversationId)
              .in("wa_message_id", messageIds)
          : { data: [] };
        const existingIds = new Set((existingMessages || []).map((message) => message.wa_message_id));

        const inserts = messageRows
          .filter((message) => message.id && !existingIds.has(message.id))
          .sort((a, b) => {
            const dateA = a.created_time ? new Date(a.created_time).getTime() : 0;
            const dateB = b.created_time ? new Date(b.created_time).getTime() : 0;
            return dateA - dateB;
          })
          .map((message) => {
            const parsed = parseInstagramMessage(message);
            if (!parsed) return null;
            const createdAt = message.created_time
              ? new Date(message.created_time).toISOString()
              : new Date().toISOString();
            const isOutbound = message.from?.id === socialAccount.instagram_id;

            return {
              conversation_id: conversationId,
              contact_id: contactId,
              direction: isOutbound ? "outbound" : "inbound",
              type: parsed.type,
              content: parsed.content,
              wa_message_id: message.id,
              status: isOutbound ? "sent" : "delivered",
              is_bot: false,
              created_at: createdAt,
            };
          })
          .filter((message): message is NonNullable<typeof message> => Boolean(message));

        if (inserts.length > 0) {
          // ignoreDuplicates cierra la race con el webhook push que puede escribir el mismo wa_message_id.
          const { data: upserted, error: insertError } = await admin
            .from("messages")
            .upsert(inserts, { onConflict: "conversation_id,wa_message_id", ignoreDuplicates: true })
            .select("id");
          if (insertError) throw insertError;
          const insertedCount = upserted?.length ?? 0;
          result.insertedMessages += insertedCount;
          result.skippedMessages += inserts.length - insertedCount;
        }
        result.skippedMessages += messageRows.length - inserts.length;

        const latest = messageRows[0];
        if (latest) {
          const latestParsed = parseInstagramMessage(latest);
          if (!latestParsed) continue;
          const preview = latestParsed.content.type === "text"
            ? latestParsed.content.text.slice(0, 100)
            : `[${latestParsed.type}]`;
          const latestAt = latest.created_time
            ? new Date(latest.created_time).toISOString()
            : updatedAt;

          await admin
            .from("conversations")
            .update({
              last_message_preview: preview,
              updated_at: latestAt,
              status: "open",
            })
            .eq("id", conversationId);
        }
      }

      await admin
        .from("channels")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", channel.id);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Instagram sync failed");
    }
  }

  return result;
}
