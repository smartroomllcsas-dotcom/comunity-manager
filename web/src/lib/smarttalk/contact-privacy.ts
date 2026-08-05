import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type RestrictedContactInput = {
  organizationId: string;
  brandId: string;
  channelId: string;
  externalContactId: string;
  name?: string | null;
  profilePictureUrl?: string | null;
  lastMessageAt?: string;
};

function hashExternalContactId(input: RestrictedContactInput) {
  return createHash("sha256")
    .update(
      [input.organizationId, input.brandId, input.channelId, input.externalContactId].join(":"),
      "utf8",
    )
    .digest("hex");
}

function maskedContactId(hash: string) {
  return `restricted:${hash.slice(0, 24)}`;
}

function isPrivateIdentifierTableUnavailable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * Creates or refreshes the minimum lead record allowed after a hard quota
 * decision. Never persist the provider phone/PSID/Instagram ID in this row.
 */
export async function upsertRestrictedContact(input: RestrictedContactInput) {
  const admin = createAdminClient("smarttalk");
  const externalIdHash = hashExternalContactId(input);

  const { data: existingPrivate, error: privateLookupError } = await admin
    .from("contact_private_identifiers")
    .select("contact_id")
    .eq("organization_id", input.organizationId)
    .eq("brand_id", input.brandId)
    .eq("channel_id", input.channelId)
    .eq("external_id_hash", externalIdHash)
    .maybeSingle();

  const privateTableAvailable = !privateLookupError || !isPrivateIdentifierTableUnavailable(privateLookupError);
  if (privateLookupError && privateTableAvailable) throw privateLookupError;

  const lastMessageAt = input.lastMessageAt || new Date().toISOString();
  if (existingPrivate?.contact_id) {
    const { data, error } = await admin
      .from("contacts")
      .update({
        name: input.name || undefined,
        profile_picture_url: input.profilePictureUrl || undefined,
        last_message_at: lastMessageAt,
        visibility_status: "restricted",
        restricted_reason: "contacts_limit",
      })
      .eq("id", existingPrivate.contact_id)
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id as string, restricted: true as const };
  }

  const { data: contact, error: contactError } = await admin
    .from("contacts")
    .upsert(
      {
        organization_id: input.organizationId,
        brand_id: input.brandId,
        wa_id: maskedContactId(externalIdHash),
        name: input.name || "Lead restringido",
        profile_picture_url: input.profilePictureUrl || null,
        tags: ["quota-restricted"],
        custom_fields: {
          quota_restricted: true,
          requires_upgrade: true,
        },
        visibility_status: "restricted",
        restricted_reason: "contacts_limit",
        last_message_at: lastMessageAt,
      },
      { onConflict: "organization_id,brand_id,wa_id" },
    )
    .select("id")
    .single();
  if (contactError) throw contactError;

  if (!privateTableAvailable) {
    console.error("[billing] contact privacy migration is not applied; using masked contact key only");
    return { id: contact.id as string, restricted: true as const };
  }

  const { data: privateIdentifier, error: privateInsertError } = await admin
    .from("contact_private_identifiers")
    .upsert(
      {
        organization_id: input.organizationId,
        brand_id: input.brandId,
        channel_id: input.channelId,
        contact_id: contact.id,
        external_id_hash: externalIdHash,
      },
      { onConflict: "organization_id,brand_id,channel_id,external_id_hash" },
    )
    .select("contact_id")
    .single();
  if (privateInsertError) {
    if (isPrivateIdentifierTableUnavailable(privateInsertError)) {
      console.error("[billing] contact privacy migration is not applied; using masked contact key only");
      return { id: contact.id as string, restricted: true as const };
    }
    throw privateInsertError;
  }

  return { id: (privateIdentifier?.contact_id || contact.id) as string, restricted: true as const };
}

export function isRestrictedContact(contact: { visibility_status?: string | null }) {
  return contact.visibility_status === "restricted";
}
