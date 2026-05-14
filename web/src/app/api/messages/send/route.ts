import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, sendMedia, getOrgWhatsAppCredentials } from "@/lib/whatsapp/api";
import {
  sendRespondIoText,
  sendRespondIoAttachment,
  getRespondIoCredentials,
} from "@/lib/respond-io/api";
import type { MessageContent, MessageType } from "@/types/database";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase.from("agents").select("*").eq("id", user.id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { conversationId, type, content } = (await request.json()) as {
    conversationId: string;
    type: MessageType;
    content: MessageContent;
  };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, contact:contacts(*), channel:channels(id, type)")
    .eq("id", conversationId)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!conversation || !conversation.contact) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const channelType = (conversation.channel as { type?: string } | null)?.type;
  const contactIdentifier = conversation.contact.respond_io_id
    ? `id:${conversation.contact.respond_io_id}`
    : `phone:${conversation.contact.wa_id}`;

  let providerMessageId: string | undefined;

  try {
    if (channelType === "respond_io") {
      const creds = await getRespondIoCredentials(conversation.channel_id);

      let resp;
      switch (content.type) {
        case "text":
          resp = await sendRespondIoText({
            apiToken: creds.apiToken,
            contactIdentifier,
            channelId: creds.respondChannelId,
            text: content.text,
          });
          break;
        case "image": case "video": case "audio":
          resp = await sendRespondIoAttachment({
            apiToken: creds.apiToken,
            contactIdentifier,
            channelId: creds.respondChannelId,
            type: content.type,
            url: content.url,
            description: "caption" in content ? content.caption : undefined,
          });
          break;
        case "document":
          resp = await sendRespondIoAttachment({
            apiToken: creds.apiToken,
            contactIdentifier,
            channelId: creds.respondChannelId,
            type: "file",
            url: content.url,
            description: "filename" in content ? content.filename : undefined,
          });
          break;
        default:
          return NextResponse.json({ error: `Unsupported message type: ${type}` }, { status: 400 });
      }
      providerMessageId = typeof resp.messageId === "string" ? resp.messageId : undefined;
    } else {
      const { phoneNumberId, accessToken } = await getOrgWhatsAppCredentials(
        agent.organization_id,
        conversation.channel_id,
      );

      let waResponse: { messages: { id: string }[] };
      switch (content.type) {
        case "text":
          waResponse = await sendText({
            to: conversation.contact.wa_id, text: content.text, phoneNumberId, accessToken,
          });
          break;
        case "image": case "video": case "audio": case "document":
          waResponse = await sendMedia({
            to: conversation.contact.wa_id,
            type: content.type,
            mediaUrl: content.url,
            caption: "caption" in content ? content.caption : undefined,
            filename: "filename" in content ? content.filename : undefined,
            phoneNumberId, accessToken,
          });
          break;
        default:
          return NextResponse.json({ error: `Unsupported message type: ${type}` }, { status: 400 });
      }
      providerMessageId = waResponse.messages[0]?.id;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 500 },
    );
  }

  const { data: message } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      agent_id: agent.id,
      direction: "outbound",
      type,
      content,
      wa_message_id: providerMessageId,
      status: "sent",
      channel: channelType === "respond_io" ? "respond_io" : "whatsapp",
      channel_id: conversation.channel_id,
    })
    .select()
    .single();

  const preview = content.type === "text" ? content.text.slice(0, 100) : `[${type}]`;
  await admin
    .from("conversations")
    .update({ last_message_preview: preview, unread_count: 0 })
    .eq("id", conversationId);

  return NextResponse.json({ message });
}
