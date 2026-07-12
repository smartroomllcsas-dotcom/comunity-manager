import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, sendMedia, sendTemplate, getOrgWhatsAppCredentials } from "@/lib/whatsapp/api";
import { sendMetaTextMessage, sendMetaAttachment } from "@/lib/meta";
import {
  sendRespondIoText,
  sendRespondIoAttachment,
  getRespondIoCredentials,
} from "@/lib/respond-io/api";
import { resolveToken } from "@/lib/auth/token-crypto";
import { sendMessageSchema } from "@/lib/validation/message";
import type { MessageContent, MessageType } from "@/types/database";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase.from("agents").select("*").eq("id", user.id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const rawBody = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // parsed.data.type y parsed.data.content.type deben coincidir; el tipo top-level
  // se mantiene por compat con la lógica downstream que lo usa como MessageType.
  if (parsed.data.type !== parsed.data.content.type) {
    return NextResponse.json(
      { error: "type y content.type no coinciden" },
      { status: 400 }
    );
  }

  const { conversationId, type, content } = parsed.data as {
    conversationId: string;
    type: MessageType;
    content: MessageContent;
  };

  // Nunca traer access_token en el join: si conversation se serializa/loguea, no leakea.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, contact:contacts(*), channel:channels(id, type, whatsapp_phone_number_id, whatsapp_business_account_id, meta_business_id)")
    .eq("id", conversationId)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!conversation || !conversation.contact) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const channelType = (conversation.channel as { type?: string } | null)?.type;

  // El token vive sólo en esta variable server-side, nunca en el objeto conversation.
  let channelAccessToken: string | null = null;
  if (channelType === "facebook_messenger" || channelType === "instagram") {
    const { data: chan } = await admin
      .from("channels")
      .select("access_token, access_token_ciphertext")
      .eq("id", conversation.channel_id)
      .single();
    channelAccessToken = resolveToken(
      (chan?.access_token_ciphertext as string | null) ?? null,
      (chan?.access_token as string | null) ?? null
    );
  }
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
        case "image":
        case "video":
        case "audio":
        case "sticker":
          resp = await sendRespondIoAttachment({
            apiToken: creds.apiToken,
            contactIdentifier,
            channelId: creds.respondChannelId,
            type: content.type === "sticker" ? "image" : content.type,
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
    } else if (channelType === "facebook_messenger" || channelType === "instagram") {
      if (!channelAccessToken) {
        return NextResponse.json({ error: "Channel not configured with access token" }, { status: 400 });
      }
      const recipientId = conversation.contact.wa_id;
      if (!recipientId) {
        return NextResponse.json({ error: "Conversation contact is missing Meta recipient id" }, { status: 400 });
      }
      if (content.type === "text") {
        const resp = await sendMetaTextMessage(channelAccessToken, recipientId, content.text);
        providerMessageId = typeof resp?.message_id === "string" ? resp.message_id : undefined;
      } else if (
        content.type === "image" ||
        content.type === "video" ||
        content.type === "audio" ||
        content.type === "document" ||
        content.type === "sticker"
      ) {
        const resp = await sendMetaAttachment(
          channelAccessToken,
          recipientId,
          content.type === "document" || content.type === "sticker" ? "image" : content.type,
          content.url
        );
        providerMessageId = typeof resp?.message_id === "string" ? resp.message_id : undefined;
      } else {
        return NextResponse.json(
          { error: "Messenger/Instagram no soporta sticker de salida todavía" },
          { status: 400 }
        );
      }
    } else {
      const { phoneNumberId, accessToken } = await getOrgWhatsAppCredentials(
        agent.organization_id,
        conversation.channel_id,
      );

      let waResponse: { messages: { id: string }[] };
      switch (content.type) {
        case "template": {
          let templateQuery = admin
            .from("message_templates")
            .select("id, name, language, components, status, channel_id")
            .eq("organization_id", agent.organization_id)
            .eq("name", content.template_name)
            .eq("language", content.language)
            .eq("status", "approved");

          if (conversation.channel_id) {
            templateQuery = templateQuery.or(`channel_id.is.null,channel_id.eq.${conversation.channel_id}`);
          } else {
            templateQuery = templateQuery.is("channel_id", null);
          }

          const { data: template } = await templateQuery.limit(1).maybeSingle();

          if (!template) {
            return NextResponse.json(
              { error: "Plantilla aprobada no encontrada para este canal de WhatsApp" },
              { status: 400 }
            );
          }

          waResponse = await sendTemplate({
            to: conversation.contact.wa_id,
            templateName: template.name,
            language: template.language,
            components: content.components || [],
            phoneNumberId,
            accessToken,
          });
          break;
        }
        case "text":
          waResponse = await sendText({
            to: conversation.contact.wa_id, text: content.text, phoneNumberId, accessToken,
          });
          break;
        case "image":
        case "video":
        case "audio":
        case "document":
        case "sticker":
          waResponse = await sendMedia({
            to: conversation.contact.wa_id,
            type: content.type === "sticker" ? "image" : content.type,
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
    const message = error instanceof Error ? error.message : "Send failed";
    const status = message.startsWith("Meta API:") || message.includes("Token expirado") ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }

  if (providerMessageId) {
    const { data: existingMessage } = await admin
      .from("messages")
      .select("*, agent:agents(id, name)")
      .eq("conversation_id", conversationId)
      .eq("wa_message_id", providerMessageId)
      .maybeSingle();

    if (existingMessage) {
      const preview = content.type === "text" ? content.text.slice(0, 100) : `[${type}]`;
      await admin
        .from("conversations")
        .update({ last_message_preview: preview, unread_count: 0 })
        .eq("id", conversationId);

      return NextResponse.json({ message: existingMessage });
    }
  }

  const { data: message } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      contact_id: conversation.contact.id,
      agent_id: agent.id,
      direction: "outbound",
      type,
      content,
      wa_message_id: providerMessageId,
      status: "sent",
      is_bot: false,
    })
    .select("*, agent:agents(id, name)")
    .single();

  if (!message) {
    return NextResponse.json(
      { error: "No se pudo guardar el mensaje enviado en la bandeja" },
      { status: 500 }
    );
  }

  const preview = content.type === "text" ? content.text.slice(0, 100) : `[${type}]`;
  await admin
    .from("conversations")
    .update({ last_message_preview: preview, unread_count: 0 })
    .eq("id", conversationId);

  return NextResponse.json({ message });
}
