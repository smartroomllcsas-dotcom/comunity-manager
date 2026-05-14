import { createAdminClient } from "@/lib/supabase/admin";
import type { WebhookMessage, WebhookContact, WebhookStatus } from "./types";
import type { MessageContent, MessageType } from "@/types/database";
import { processIncomingWithChatbot } from "@/lib/chatbot/engine";

export async function processIncomingMessage(
  message: WebhookMessage,
  contact: WebhookContact,
  phoneNumberId: string
) {
  const admin = createAdminClient();

  // 1. Find channel by phone_number_id
  const { data: channel } = await admin
    .from("channels")
    .select("id, organization_id, access_token")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .eq("status", "active")
    .single();

  if (!channel) {
    console.error(`No active channel found for phone_number_id: ${phoneNumberId}`);
    return;
  }

  const org = { id: channel.organization_id };

  // Update channel last_active_at
  await admin
    .from("channels")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", channel.id);

  // 2. Upsert contact
  const { data: dbContact } = await admin
    .from("contacts")
    .upsert(
      {
        organization_id: org.id,
        wa_id: contact.wa_id,
        name: contact.profile.name,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,wa_id" }
    )
    .select("id")
    .single();

  if (!dbContact) return;

  // 3. Find or create open conversation
  let { data: conversation } = await admin
    .from("conversations")
    .select("id, unread_count")
    .eq("contact_id", dbContact.id)
    .in("status", ["open", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!conversation) {
    const { data: newConv } = await admin
      .from("conversations")
      .insert({
        organization_id: org.id,
        contact_id: dbContact.id,
        channel_id: channel.id,
        status: "open",
      })
      .select("id, unread_count")
      .single();
    conversation = newConv;
  }

  if (!conversation) return;

  // 4. Parse message content
  const { type, content } = parseMessageContent(message);

  // 5. Insert message
  await admin.from("messages").insert({
    conversation_id: conversation.id,
    contact_id: dbContact.id,
    direction: "inbound",
    type,
    content,
    wa_message_id: message.id,
    status: "delivered",
  });

  // 6. Update conversation
  const preview = content.type === "text" ? content.text.slice(0, 100) : `[${type}]`;

  await admin
    .from("conversations")
    .update({
      unread_count: (conversation.unread_count || 0) + 1,
      last_message_preview: preview,
      status: "open",
    })
    .eq("id", conversation.id);

  // 7. Process with chatbot/AI
  const textContent =
    content.type === "text" ? (content as { type: "text"; text: string }).text : "";

  if (textContent) {
    const handled = await processIncomingWithChatbot({
      conversationId: conversation.id,
      contactWaId: contact.wa_id,
      organizationId: org.id,
      messageText: textContent,
      channelId: channel.id,
    });

    // If not handled, assign via round-robin
    if (!handled) {
      const { data: availableAgent } = await admin
        .from("agents")
        .select("id")
        .eq("organization_id", org.id)
        .eq("status", "online")
        .order("created_at")
        .limit(1)
        .single();

      if (availableAgent) {
        await admin
          .from("conversations")
          .update({ assigned_agent_id: availableAgent.id })
          .eq("id", conversation.id);
      }
    }
  }
}

export async function processStatusUpdate(status: WebhookStatus) {
  const admin = createAdminClient();
  if (!status.id) return;
  await admin.from("messages").update({ status: status.status }).eq("wa_message_id", status.id);
}

function parseMessageContent(message: WebhookMessage): { type: MessageType; content: MessageContent } {
  switch (message.type) {
    case "text":
      return { type: "text", content: { type: "text", text: message.text!.body } };
    case "image":
      return { type: "image", content: { type: "image", url: message.image!.id, caption: message.image!.caption } };
    case "video":
      return { type: "video", content: { type: "video", url: message.video!.id, caption: message.video!.caption } };
    case "audio":
      return { type: "audio", content: { type: "audio", url: message.audio!.id } };
    case "document":
      return { type: "document", content: { type: "document", url: message.document!.id, filename: message.document!.filename, caption: message.document!.caption } };
    case "location":
      return { type: "location", content: { type: "location", latitude: message.location!.latitude, longitude: message.location!.longitude, name: message.location!.name } };
    case "sticker":
      return { type: "sticker", content: { type: "sticker", url: message.sticker!.id } };
    default:
      return { type: "text", content: { type: "text", text: `[Mensaje tipo: ${message.type}]` } };
  }
}
