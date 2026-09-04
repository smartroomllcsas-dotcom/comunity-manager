import { createAdminClient } from "@/lib/supabase/admin";
import { buildAttachmentContent, type AttachmentContent } from "@/lib/inbox/attachments";
import { scheduleAttachmentResolution } from "@/lib/inbox/media-resolver";
import type { WebhookMessage, WebhookContact, WebhookStatus } from "./types";
import type { MessageContent, MessageType } from "@/types/database";
import { processIncomingWithChatbot } from "@/lib/chatbot/engine";
import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { upsertRestrictedContact } from "@/lib/smarttalk/contact-privacy";
import { recordContactOverageEvent } from "@/lib/smarttalk/contact-overage";
import { understandInboundMedia, inboundContentToText } from "@/lib/chatbot/media-understanding";

export async function processIncomingMessage(
  message: WebhookMessage,
  contact: WebhookContact,
  phoneNumberId: string
) {
  const admin = createAdminClient();

  // 1. Find channel by phone_number_id
  const { data: channel } = await admin
    .from("channels")
    .select("id, organization_id, brand_id, access_token")
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
  const { data: existingContact } = await admin
    .from("contacts")
    .select("id, visibility_status")
    .eq("organization_id", org.id)
    .eq("brand_id", channel.brand_id)
    .eq("wa_id", contact.wa_id)
    .maybeSingle();

  if (existingContact?.visibility_status === "restricted") {
    await admin
      .from("contacts")
      .update({
        name: contact.profile.name || undefined,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", existingContact.id);
    const { type } = parseMessageContent(message);
    await recordContactOverageEvent({
      organizationId: org.id,
      brandId: channel.brand_id,
      channelId: channel.id,
      contactId: existingContact.id,
      source: "whatsapp",
      providerContactId: contact.wa_id,
      providerMessageId: message.id,
      messageType: type,
      contactName: contact.profile.name,
      payload: message as unknown as Record<string, unknown>,
    });
    return;
  }

  if (!existingContact) {
    const billingDecision = await checkBillingFeature({
      organizationId: org.id,
      featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
      requestedUnits: 1,
      source: "webhook/whatsapp/inbound-contact",
    });
    if (!billingDecision.allowed) {
      // A hard quota keeps the lead traceable, but does not create a
      // conversation/message or expose its phone number in the CRM.
      const restrictedContact = await upsertRestrictedContact({
        organizationId: org.id,
        brandId: channel.brand_id,
        channelId: channel.id,
        externalContactId: contact.wa_id,
        name: contact.profile.name,
      });
      const { type } = parseMessageContent(message);
      await recordContactOverageEvent({
        organizationId: org.id,
        brandId: channel.brand_id,
        channelId: channel.id,
        contactId: restrictedContact.id,
        source: "whatsapp",
        providerContactId: contact.wa_id,
        providerMessageId: message.id,
        messageType: type,
        contactName: contact.profile.name,
        payload: message as unknown as Record<string, unknown>,
      });
      console.warn("[billing] inbound WhatsApp contact over limit; preserving webhook", {
        organizationId: org.id,
        brandId: channel.brand_id,
        channelId: channel.id,
        currentUsage: billingDecision.currentUsage,
        limit: billingDecision.limitValue,
      });
      return;
    }
  }

  const { data: dbContact } = await admin
    .from("contacts")
    .upsert(
      {
        organization_id: org.id,
        brand_id: channel.brand_id,
        wa_id: contact.wa_id,
        name: contact.profile.name,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,brand_id,wa_id" }
    )
    .select("id")
    .single();

  if (!dbContact) return;

  // 3. Find or create open conversation
  let { data: conversation } = await admin
    .from("conversations")
    .select("id, unread_count")
    .eq("organization_id", org.id)
    .eq("brand_id", channel.brand_id)
    .eq("contact_id", dbContact.id)
    .eq("channel_id", channel.id)
    .in("status", ["open", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!conversation) {
    const { data: newConv } = await admin
      .from("conversations")
      .insert({
        organization_id: org.id,
        brand_id: channel.brand_id,
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

  // 5. Insert message. Meta may redeliver the same event; the partial
  // unique index makes 23505 the expected duplicate-delivery result.
  const { data: insertedMessage, error: messageError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      contact_id: dbContact.id,
      direction: "inbound",
      type,
      content,
      wa_message_id: message.id,
      status: "delivered",
    })
    .select("id");

  // El 23505 es el reenvío del mismo webhook por parte de Meta: el mensaje ya
  // existe y no hay que duplicarlo ni volver a descargar su medio.
  if (messageError?.code === "23505") return;
  if (messageError) throw messageError;
  if (!insertedMessage?.length) return;

  // El mensaje ya está guardado. Para adjuntos se descarga el medio y se
  // convierte en texto (transcripción / descripción) para que el agente de IA
  // también responda a audios, imágenes y videos, no sólo a texto. Si el
  // análisis falla, el mensaje conserva su `provider_media_id` y el endpoint
  // /api/inbox/messages/[id]/media lo reintentará al abrirlo.
  let mediaText = "";
  if (content.type !== "text" && "provider_media_id" in content) {
    try {
      mediaText = await understandInboundMedia({
        messageId: insertedMessage[0].id as string,
        organizationId: org.id,
        brandId: channel.brand_id,
        channelId: channel.id,
        content: content as AttachmentContent,
      });
    } catch (e) {
      console.error("[whatsapp-webhook] análisis de medio falló:", e);
      scheduleAttachmentResolution({
        messageId: insertedMessage[0].id as string,
        organizationId: org.id,
        brandId: channel.brand_id,
        channelId: channel.id,
        content: content as AttachmentContent,
      });
    }
  } else if (content.type === "location") {
    mediaText = inboundContentToText(content);
  }

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

  // 7. Process with chatbot/AI (texto, o el texto derivado del adjunto)
  const textContent =
    content.type === "text" ? (content as { type: "text"; text: string }).text : mediaText;

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
      const { data: onlineAgents } = await admin
        .from("agents")
        .select("id, member_type, is_super_admin")
        .eq("organization_id", org.id)
        .eq("status", "online")
        .order("created_at");

      const { data: brandAssignments } = await admin
        .from("brand_advisor_assignments")
        .select("agent_id")
        .eq("organization_id", org.id)
        .eq("brand_id", channel.brand_id);

      const assignedAgentIds = new Set((brandAssignments || []).map((row) => row.agent_id as string));
      const eligibleAgents = (onlineAgents || []).filter((candidate) =>
        candidate.is_super_admin === true ||
        (candidate.member_type !== "brand_admin" && candidate.member_type !== "brand_advisor") ||
        assignedAgentIds.has(candidate.id as string)
      );
      const availableAgent = eligibleAgents[0];

      if (availableAgent) {
        await admin
          .from("conversations")
          .update({ assigned_agent_id: availableAgent.id })
          .eq("id", conversation.id);
      }
    }
  }
}

export async function processStatusUpdate(status: WebhookStatus, phoneNumberId: string) {
  const admin = createAdminClient();
  if (!status.id) return;
  const { data: channel } = await admin
    .from("channels")
    .select("id")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();
  if (!channel) return;

  const { data: conversations } = await admin
    .from("conversations")
    .select("id")
    .eq("channel_id", channel.id);
  const conversationIds = (conversations || []).map((conversation) => conversation.id);
  if (conversationIds.length === 0) return;

  await admin
    .from("messages")
    .update({ status: status.status })
    .eq("wa_message_id", status.id)
    .in("conversation_id", conversationIds);

  // Plantilla de primer contacto que Meta NO pudo entregar (número sin
  // WhatsApp, país con restricciones de marketing, etc.): se marca el lead
  // como "fallido" para que vuelva a la lista de pendientes con el motivo, y
  // se deja nota para que el asesor lo contacte por otro medio.
  if (status.status === "failed") {
    await markFirstTouchFailed(admin, status, conversationIds);
  }
}

const WA_ERROR_LABELS: Record<number, string> = {
  131026: "el número no tiene WhatsApp o no acepta mensajes",
  131049: "Meta limitó los mensajes de marketing a este número",
  131050: "el usuario dejó de recibir mensajes de marketing",
  131047: "ventana de 24 h vencida",
  130472: "número en experimento de Meta (no recibe marketing)",
  131053: "medio no descargable",
  131000: "error genérico de WhatsApp",
};

async function markFirstTouchFailed(
  admin: ReturnType<typeof createAdminClient>,
  status: WebhookStatus,
  conversationIds: string[],
) {
  try {
    const { data: msg } = await admin
      .from("messages")
      .select("id, conversation_id, contact_id, type, is_bot, content")
      .eq("wa_message_id", status.id)
      .in("conversation_id", conversationIds)
      .maybeSingle();
    if (!msg || msg.type !== "template" || !msg.is_bot || !msg.contact_id) return;

    const err = status.errors?.[0];
    const reason = err
      ? `${WA_ERROR_LABELS[err.code] || err.title || "error"} (código ${err.code})`
      : "sin motivo reportado por Meta";

    const { data: contact } = await admin
      .from("contacts")
      .select("custom_fields")
      .eq("id", msg.contact_id)
      .maybeSingle();
    const cf = { ...((contact?.custom_fields as Record<string, unknown> | null) || {}) };
    if (cf.wa_first_touch !== undefined) {
      cf.wa_first_touch = `fallido (${reason})`;
      cf.wa_first_touch_failed_at = new Date().toISOString();
      await admin.from("contacts").update({ custom_fields: cf }).eq("id", msg.contact_id);
    }

    const templateName =
      (msg.content as { template_name?: string } | null)?.template_name || "plantilla";
    const { addSystemNote } = await import("@/lib/smarttalk/internal-notes");
    await addSystemNote({
      conversationId: msg.conversation_id as string,
      content:
        `⚠️ WhatsApp no pudo entregar la ${templateName}: ${reason}. ` +
        `Conviene contactar al lead por llamada o correo.`,
      prefix: "[WhatsApp]",
    });
  } catch (e) {
    console.warn("[whatsapp-webhook] no se pudo marcar el primer contacto como fallido:", e);
  }
}

/**
 * Contenido de un adjunto de WhatsApp a partir de su media id.
 *
 * `url` queda vacía a propósito: se rellena cuando el medio se descarga y se
 * guarda. Hasta entonces la interfaz usa el endpoint seguro, que sabe resolver
 * el id.
 */
function mediaContent(
  providerType: string,
  mediaId: string,
  extra: { caption?: string; filename?: string; mimeType?: string } = {},
): { type: MessageType; content: MessageContent } {
  const content = buildAttachmentContent({
    providerType,
    providerMediaId: mediaId,
    filename: extra.filename || null,
    caption: extra.caption || null,
    mimeType: extra.mimeType || null,
    source: "whatsapp",
  });
  return { type: content.type, content: content as MessageContent };
}

function parseMessageContent(message: WebhookMessage): { type: MessageType; content: MessageContent } {
  switch (message.type) {
    case "text":
      return { type: "text", content: { type: "text", text: message.text!.body } };
    // Los cinco tipos con medio comparten tratamiento: WhatsApp entrega un
    // **media id**, no una URL. Ponerlo en `url` —lo que se hacía— generaba
    // `<img src="1234567890">`. Ahora viaja como `provider_media_id` y el medio
    // se resuelve aparte, contra Graph y con el token del canal.
    case "image":
      return mediaContent("image", message.image!.id, {
        caption: message.image!.caption,
        mimeType: message.image!.mime_type,
      });
    case "video":
      return mediaContent("video", message.video!.id, {
        caption: message.video!.caption,
        mimeType: message.video!.mime_type,
      });
    case "audio":
      return mediaContent("audio", message.audio!.id, {
        mimeType: message.audio!.mime_type,
      });
    case "document":
      return mediaContent("document", message.document!.id, {
        caption: message.document!.caption,
        filename: message.document!.filename,
        mimeType: message.document!.mime_type,
      });
    case "location":
      return { type: "location", content: { type: "location", latitude: message.location!.latitude, longitude: message.location!.longitude, name: message.location!.name } };
    case "sticker":
      return mediaContent("sticker", message.sticker!.id, {
        mimeType: message.sticker!.mime_type,
      });
    default:
      return { type: "text", content: { type: "text", text: `[Mensaje tipo: ${message.type}]` } };
  }
}
