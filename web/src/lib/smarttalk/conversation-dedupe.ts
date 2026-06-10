import { createAdminClient } from "@/lib/supabase/admin";

type ConversationRow = {
  id: string;
  unread_count: number | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  created_at: string | null;
};

type MessageRow = {
  id: string;
  wa_message_id: string | null;
  type: string | null;
  content: Record<string, unknown> | null;
  created_at: string | null;
};

type FindReusableConversationOptions = {
  organizationId: string;
  contactId: string;
  channelId: string;
  metadataPatch?: Record<string, unknown>;
  updatedAt?: string;
};

function previewFromMessage(message: MessageRow | null) {
  if (!message) return null;
  if (message.content?.type === "text" && typeof message.content.text === "string") {
    return message.content.text.slice(0, 100);
  }
  return `[${message.type || message.content?.type || "mensaje"}]`;
}

async function mergeDuplicateConversations(canonical: ConversationRow, duplicates: ConversationRow[]) {
  if (duplicates.length === 0) return;

  const admin = createAdminClient("smarttalk");
  const duplicateIds = duplicates.map((conversation) => conversation.id);

  const { data: duplicateMessages } = await admin
    .from("messages")
    .select("id, wa_message_id")
    .in("conversation_id", duplicateIds);

  const providerIds = Array.from(
    new Set(
      ((duplicateMessages || []) as Array<{ wa_message_id: string | null }>)
        .map((message) => message.wa_message_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: canonicalMessages } = providerIds.length
    ? await admin
        .from("messages")
        .select("wa_message_id")
        .eq("conversation_id", canonical.id)
        .in("wa_message_id", providerIds)
    : { data: [] };

  const canonicalProviderIds = new Set(
    ((canonicalMessages || []) as Array<{ wa_message_id: string | null }>)
      .map((message) => message.wa_message_id)
      .filter((id): id is string => Boolean(id))
  );

  const duplicateMessageRows = (duplicateMessages || []) as Array<{ id: string; wa_message_id: string | null }>;
  const messagesToDelete = duplicateMessageRows
    .filter((message) => message.wa_message_id && canonicalProviderIds.has(message.wa_message_id))
    .map((message) => message.id);
  const messagesToMove = duplicateMessageRows
    .filter((message) => !messagesToDelete.includes(message.id))
    .map((message) => message.id);

  if (messagesToDelete.length > 0) {
    await admin.from("messages").delete().in("id", messagesToDelete);
  }

  if (messagesToMove.length > 0) {
    await admin
      .from("messages")
      .update({ conversation_id: canonical.id })
      .in("id", messagesToMove);
  }

  const mergedAt = new Date().toISOString();
  await Promise.all(
    duplicates.map((conversation) =>
      admin
        .from("conversations")
        .update({
          status: "closed",
          unread_count: 0,
          metadata: {
            ...(conversation.metadata || {}),
            merged_into: canonical.id,
            merged_at: mergedAt,
            merged_reason: "duplicate_contact_channel",
          },
        })
        .eq("id", conversation.id)
    )
  );

  const { data: latestMessage } = await admin
    .from("messages")
    .select("id, wa_message_id, type, content, created_at")
    .eq("conversation_id", canonical.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: unreadCount } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", canonical.id)
    .eq("direction", "inbound")
    .neq("status", "read");

  await admin
    .from("conversations")
    .update({
      last_message_preview: previewFromMessage((latestMessage as MessageRow | null) || null),
      updated_at: ((latestMessage as MessageRow | null)?.created_at || canonical.updated_at || mergedAt),
      unread_count: unreadCount || 0,
      status: "open",
    })
    .eq("id", canonical.id);
}

export async function findReusableConversation(options: FindReusableConversationOptions) {
  const admin = createAdminClient("smarttalk");
  const { organizationId, contactId, channelId, metadataPatch = {}, updatedAt } = options;

  const { data, error } = await admin
    .from("conversations")
    .select("id, unread_count, metadata, updated_at, created_at")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("channel_id", channelId)
    .in("status", ["open", "pending"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const conversations = ((data || []) as ConversationRow[]).filter((conversation) => conversation.id);
  if (conversations.length === 0) return null;

  const [canonical, ...duplicates] = conversations;

  if (Object.keys(metadataPatch).length > 0 || updatedAt) {
    await admin
      .from("conversations")
      .update({
        ...(updatedAt ? { updated_at: updatedAt } : {}),
        metadata: {
          ...(canonical.metadata || {}),
          ...metadataPatch,
        },
      })
      .eq("id", canonical.id);
  }

  await mergeDuplicateConversations(canonical, duplicates);

  return {
    id: canonical.id,
    unreadCount: canonical.unread_count || 0,
  };
}
