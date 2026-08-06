import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { findReusableConversation } from "@/lib/smarttalk/conversation-dedupe";
import type { ContactOverageSource } from "@/lib/smarttalk/contact-overage";
import type { MessageContent, MessageType } from "@/types/database";

type JsonObject = Record<string, unknown>;

export type ContactOverageEvent = {
  id: string;
  organization_id: string;
  brand_id: string;
  channel_id: string;
  contact_id: string | null;
  source: ContactOverageSource;
  provider_contact_id: string;
  provider_message_id: string | null;
  event_key: string;
  message_type: string;
  contact_name: string | null;
  payload: JsonObject;
  status: "pending" | "processing" | "released" | "discarded";
  attempts: number;
  last_error: string | null;
  created_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
};

type ContactRow = {
  id: string;
  organization_id: string;
  brand_id: string;
  wa_id: string;
  name: string | null;
  tags: string[] | null;
  custom_fields: JsonObject | null;
  visibility_status: "full" | "restricted";
};

type ReleaseResult = {
  released: number;
  blocked: number;
  failed: number;
  claimed: number;
};

const MESSAGE_TYPES = new Set<MessageType>([
  "text",
  "image",
  "video",
  "audio",
  "document",
  "template",
  "interactive",
  "location",
  "sticker",
]);

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nestedObject(value: unknown, key: string) {
  return asObject(asObject(value)[key]);
}

function normalizeMessageType(value: string | null | undefined): MessageType {
  return value && MESSAGE_TYPES.has(value as MessageType)
    ? value as MessageType
    : "text";
}

function fallbackContent(event: ContactOverageEvent): { type: MessageType; content: MessageContent } {
  return {
    type: normalizeMessageType(event.message_type),
    content: {
      type: "text",
      text: `[Mensaje recuperado: ${event.message_type || "desconocido"}]`,
    },
  };
}

/**
 * Converts the provider payload retained in the service-only queue into the
 * same message shape used by the inbox. It intentionally accepts the three
 * provider payload dialects because the queue is shared by all channels.
 */
export function parseContactOverageMessage(event: ContactOverageEvent) {
  const payload = event.payload || {};
  const textObject = asObject(payload.text);
  const messageObject = asObject(payload.message);
  const quickReply = asObject(payload.quick_reply);
  const textValue = asString(payload.text)
    || asString(textObject.body)
    || asString(payload.message)
    || asString(messageObject.text)
    || asString(quickReply.payload);

  if (textValue) {
    return { type: "text" as const, content: { type: "text" as const, text: textValue } };
  }

  const interactive = asObject(payload.interactive);
  if (Object.keys(interactive).length > 0) {
    const interactiveType = asString(interactive.type);
    const buttonReply = nestedObject(interactive, "button_reply");
    const listReply = nestedObject(interactive, "list_reply");
    const body = nestedObject(interactive, "body");
    return {
      type: "interactive" as const,
      content: {
        type: "interactive" as const,
        interactive_type: interactiveType === "list" ? "list" : "button",
        body: asString(body.text)
          || asString(buttonReply.title)
          || asString(listReply.title)
          || "Respuesta interactiva",
      },
    };
  }

  const location = asObject(payload.location);
  if (typeof location.latitude === "number" && typeof location.longitude === "number") {
    return {
      type: "location" as const,
      content: {
        type: "location" as const,
        latitude: location.latitude,
        longitude: location.longitude,
        name: asString(location.name) || undefined,
      },
    };
  }

  const sticker = asObject(payload.sticker);
  if (asString(sticker.id) || asString(sticker.url)) {
    return {
      type: "sticker" as const,
      content: { type: "sticker" as const, url: asString(sticker.id) || asString(sticker.url) || "sticker" },
    };
  }

  const attachmentContainer = asObject(payload.attachments);
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : Array.isArray(attachmentContainer.data)
      ? attachmentContainer.data
      : [];
  const attachment = asObject(attachments[0] || payload.attachment);
  const attachmentPayload = nestedObject(attachment, "payload");
  const imageData = nestedObject(attachment, "image_data");
  const videoData = nestedObject(attachment, "video_data");
  const audioData = nestedObject(attachment, "audio_data");
  const image = asObject(payload.image);
  const video = asObject(payload.video);
  const audio = asObject(payload.audio);
  const document = asObject(payload.document);
  const providerType = asString(payload.type);
  const mediaId = asString(
    image.id || video.id || audio.id || document.id || imageData.id ||
      videoData.id || audioData.id || attachmentPayload.url || attachment.url ||
      payload.id || payload.mid,
  );
  const mediaUrl = asString(
    attachmentPayload.url || attachment.url || attachment.file_url || document.link ||
      image.url || imageData.url || video.url || videoData.url || audio.url || audioData.url,
  );

  if (
    providerType === "image" ||
    Object.keys(image).length > 0 ||
    Object.keys(imageData).length > 0 ||
    attachment.type === "image"
  ) {
    return { type: "image" as const, content: { type: "image" as const, url: mediaUrl || mediaId || "image" } };
  }
  if (
    providerType === "video" ||
    Object.keys(video).length > 0 ||
    Object.keys(videoData).length > 0 ||
    attachment.type === "video"
  ) {
    return { type: "video" as const, content: { type: "video" as const, url: mediaUrl || mediaId || "video" } };
  }
  if (
    providerType === "audio" ||
    Object.keys(audio).length > 0 ||
    Object.keys(audioData).length > 0 ||
    attachment.type === "audio"
  ) {
    return { type: "audio" as const, content: { type: "audio" as const, url: mediaUrl || mediaId || "audio" } };
  }
  if (providerType === "document" || Object.keys(document).length > 0 || attachment.type === "file") {
    return {
      type: "document" as const,
      content: {
        type: "document" as const,
        url: mediaUrl || mediaId || "document",
        filename: asString(document.filename) || asString(attachment.name) ||
          asString(attachment.file_name) || "archivo",
      },
    };
  }

  return fallbackContent(event);
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function isDuplicateError(error: { code?: string } | null) {
  return error?.code === "23505";
}

async function findContact(admin: ReturnType<typeof createAdminClient>, event: ContactOverageEvent) {
  if (event.contact_id) {
    const { data, error } = await admin
      .from("contacts")
      .select("id,organization_id,brand_id,wa_id,name,tags,custom_fields,visibility_status")
      .eq("id", event.contact_id)
      .eq("organization_id", event.organization_id)
      .eq("brand_id", event.brand_id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as ContactRow;
  }

  if (event.provider_contact_id && event.provider_contact_id !== "unknown") {
    const { data, error } = await admin
      .from("contacts")
      .select("id,organization_id,brand_id,wa_id,name,tags,custom_fields,visibility_status")
      .eq("organization_id", event.organization_id)
      .eq("brand_id", event.brand_id)
      .eq("wa_id", event.provider_contact_id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as ContactRow;
  }

  return null;
}

async function restoreContact(admin: ReturnType<typeof createAdminClient>, event: ContactOverageEvent) {
  const providerContactId = event.provider_contact_id.trim();
  if (!providerContactId || providerContactId === "unknown") {
    throw new Error("Cannot release overage event without provider contact id");
  }

  let contact = await findContact(admin, event);
  const sameProviderContact = await admin
    .from("contacts")
    .select("id,organization_id,brand_id,wa_id,name,tags,custom_fields,visibility_status")
    .eq("organization_id", event.organization_id)
    .eq("brand_id", event.brand_id)
    .eq("wa_id", providerContactId)
    .maybeSingle();
  if (sameProviderContact.error) throw sameProviderContact.error;

  const fullContact = sameProviderContact.data as ContactRow | null;
  if (contact && contact.visibility_status === "full" && contact.wa_id !== providerContactId) {
    throw new Error("Overage event points to a different provider contact than the existing full contact");
  }

  if (contact && fullContact && contact.id !== fullContact.id) {
    const { count, error } = await admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id);
    if (error) throw error;
    if ((count || 0) > 0) {
      throw new Error("Restricted contact has conversations and conflicts with an active contact");
    }
    const { error: deleteError } = await admin.from("contacts").delete().eq("id", contact.id);
    if (deleteError) throw deleteError;
    contact = fullContact;
  } else if (!contact && fullContact) {
    contact = fullContact;
  }

  if (!contact) {
    const { data, error } = await admin
      .from("contacts")
      .insert({
        organization_id: event.organization_id,
        brand_id: event.brand_id,
        wa_id: providerContactId,
        name: event.contact_name || "Lead recuperado",
        tags: [],
        custom_fields: {},
        visibility_status: "full",
        restricted_reason: null,
        last_message_at: event.created_at,
      })
      .select("id,organization_id,brand_id,wa_id,name,tags,custom_fields,visibility_status")
      .single();
    if (error && !isDuplicateError(error)) throw error;
    if (data) contact = data as ContactRow;
    if (!contact) {
      contact = await findContact(admin, { ...event, contact_id: null });
    }
  }

  if (!contact) throw new Error("Could not restore overage contact");

  const tags = (contact.tags || []).filter((tag) => tag !== "quota-restricted");
  const customFields = { ...(contact.custom_fields || {}) };
  delete customFields.quota_restricted;
  delete customFields.requires_upgrade;

  const { data: restored, error: restoreError } = await admin
    .from("contacts")
    .update({
      wa_id: providerContactId,
      name: event.contact_name || contact.name || "Lead recuperado",
      tags,
      custom_fields: customFields,
      visibility_status: "full",
      restricted_reason: null,
      last_message_at: event.created_at,
    })
    .eq("id", contact.id)
    .select("id,organization_id,brand_id,wa_id,name,tags,custom_fields,visibility_status")
    .single();
  if (restoreError) throw restoreError;

  return restored as ContactRow;
}

async function restoreConversation(
  admin: ReturnType<typeof createAdminClient>,
  event: ContactOverageEvent,
  contact: ContactRow,
) {
  const reusable = await findReusableConversation({
    organizationId: event.organization_id,
    contactId: contact.id,
    channelId: event.channel_id,
    metadataPatch: {
      source: "billing-overage-replay",
      original_source: event.source,
      overage_event_id: event.id,
    },
    updatedAt: event.created_at,
  });
  if (reusable?.id) return { id: reusable.id, unreadCount: reusable.unreadCount };

  const { data, error } = await admin
    .from("conversations")
    .insert({
      organization_id: event.organization_id,
      brand_id: event.brand_id,
      contact_id: contact.id,
      channel_id: event.channel_id,
      status: "open",
      priority: "medium",
      metadata: {
        source: "billing-overage-replay",
        original_source: event.source,
        overage_event_id: event.id,
      },
      updated_at: event.created_at,
    })
    .select("id,unread_count")
    .single();
  if (error) throw error;
  return { id: data.id as string, unreadCount: Number(data.unread_count || 0) };
}

async function replayEvent(admin: ReturnType<typeof createAdminClient>, event: ContactOverageEvent) {
  const billingDecision = await checkBillingFeature({
    organizationId: event.organization_id,
    featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
    requestedUnits: 0,
    source: "cron/contact-overage-release",
    forceHard: true,
  });
  if (
    !billingDecision.allowed ||
    !["within_limit", "unlimited"].includes(billingDecision.reason)
  ) {
    return "blocked" as const;
  }

  const contact = await restoreContact(admin, event);
  const conversation = await restoreConversation(admin, event, contact);
  const parsed = parseContactOverageMessage(event);
  const providerMessageId = event.provider_message_id || event.event_key || randomUUID();

  const { error: messageError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      contact_id: contact.id,
      direction: "inbound",
      type: parsed.type,
      content: parsed.content,
      wa_message_id: providerMessageId,
      status: "delivered",
      is_bot: false,
      created_at: event.created_at,
    })
    .select("id")
    .maybeSingle();
  if (messageError && !isDuplicateError(messageError)) throw messageError;

  const preview = parsed.content.type === "text"
    ? parsed.content.text.slice(0, 100)
    : `[${parsed.type}]`;
  await admin
    .from("conversations")
    .update({
      unread_count: (conversation.unreadCount || 0) + (isDuplicateError(messageError) ? 0 : 1),
      last_message_preview: preview,
      status: "open",
      updated_at: event.created_at,
    })
    .eq("id", conversation.id);

  return "released" as const;
}

async function updateClaimedEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: ContactOverageEvent,
  workerId: string,
  values: Record<string, unknown>,
) {
  await admin
    .from("contact_overage_events")
    .update(values)
    .eq("id", event.id)
    .eq("status", "processing")
    .eq("claimed_by", workerId);
}

export async function releaseContactOverageEvents(options: {
  limit?: number;
  workerId?: string;
  staleAfterSeconds?: number;
} = {}): Promise<ReleaseResult> {
  const admin = createAdminClient("smarttalk");
  const workerId = options.workerId || `contact-overage-${randomUUID()}`;
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit || 50)));
  const staleAfterSeconds = Math.min(
    86400,
    Math.max(60, Math.floor(options.staleAfterSeconds || 900)),
  );

  const { data, error } = await admin.rpc("claim_contact_overage_events", {
    p_worker_id: workerId,
    p_limit: limit,
    p_stale_after_seconds: staleAfterSeconds,
  });
  if (error) throw error;

  const claimed = (data || []) as ContactOverageEvent[];
  const result: ReleaseResult = {
    released: 0,
    blocked: 0,
    failed: 0,
    claimed: claimed.length,
  };

  for (const event of claimed) {
    try {
      const outcome = await replayEvent(admin, event);
      if (outcome === "blocked") {
        result.blocked += 1;
        await updateClaimedEvent(admin, event, workerId, {
          status: "pending",
          claimed_at: null,
          claimed_by: null,
          last_error: "Plan still does not allow releasing this contact",
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      result.released += 1;
      await updateClaimedEvent(admin, event, workerId, {
        status: "released",
        claimed_at: null,
        claimed_by: null,
        released_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      result.failed += 1;
      await updateClaimedEvent(admin, event, workerId, {
        status: "pending",
        claimed_at: null,
        claimed_by: null,
        last_error: sanitizeError(error),
        updated_at: new Date().toISOString(),
      });
      console.error("[billing] overage release failed", {
        eventId: event.id,
        attempts: event.attempts,
        error: sanitizeError(error),
      });
    }
  }

  return result;
}
