import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type ContactOverageSource = "messenger" | "instagram" | "whatsapp";

type JsonObject = Record<string, unknown>;

export type ContactOverageEventInput = {
  organizationId: string;
  brandId: string;
  channelId: string;
  contactId?: string | null;
  source: ContactOverageSource;
  providerContactId: string;
  providerMessageId?: string | null;
  messageType: string;
  contactName?: string | null;
  payload: JsonObject;
  eventKey?: string | null;
};

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Provider message ids are the preferred idempotency key. The digest fallback
 * keeps postbacks and older provider payloads idempotent as well.
 */
export function buildContactOverageEventKey(input: {
  channelId: string;
  source: ContactOverageSource;
  providerContactId: string;
  providerMessageId?: string | null;
  payload: JsonObject;
  eventKey?: string | null;
}) {
  const explicitKey = input.eventKey?.trim();
  if (explicitKey) return explicitKey.slice(0, 200);

  const providerMessageId = input.providerMessageId?.trim();
  if (providerMessageId) return providerMessageId.slice(0, 200);

  return digest(JSON.stringify([
    input.channelId,
    input.source,
    input.providerContactId,
    input.payload,
  ]));
}

/**
 * Stores an over-limit inbound event in a service-role-only table. The CRM
 * deliberately remains conversation-free until a later release worker moves
 * the event into the normal inbox after an upgrade.
 */
export async function recordContactOverageEvent(input: ContactOverageEventInput) {
  const providerContactId = input.providerContactId.trim();
  if (!providerContactId) throw new Error("Contact overage requires provider contact id");

  const eventKey = buildContactOverageEventKey({
    channelId: input.channelId,
    source: input.source,
    providerContactId,
    providerMessageId: input.providerMessageId,
    payload: input.payload,
    eventKey: input.eventKey,
  });

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("contact_overage_events")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      channel_id: input.channelId,
      contact_id: input.contactId || null,
      source: input.source,
      provider_contact_id: providerContactId,
      provider_message_id: input.providerMessageId || null,
      event_key: eventKey,
      message_type: input.messageType,
      contact_name: input.contactName || null,
      payload: input.payload,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (!error) return { id: data?.id as string | undefined, duplicate: false };

  if (error.code !== "23505") throw error;

  const { data: existing, error: lookupError } = await admin
    .from("contact_overage_events")
    .select("id")
    .eq("channel_id", input.channelId)
    .eq("event_key", eventKey)
    .maybeSingle();
  if (lookupError) throw lookupError;

  return { id: existing?.id as string | undefined, duplicate: true };
}
