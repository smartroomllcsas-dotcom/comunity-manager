/**
 * Facebook Lead Ads (leadgen) ingestion — turns lead-form submissions into
 * CRM contacts under the brand that owns the Facebook Page.
 *
 * Flow: webhook change {field:"leadgen"} → fetch full lead via Graph API with
 * the page token → upsert smarttalk.contacts with every answer preserved in
 * custom_fields. No conversation is created (a form submission is not a chat).
 *
 * Idempotency: Meta redelivers webhooks; a contact whose
 * custom_fields.leadgen_id matches is skipped.
 *
 * Error contract: THROW on transient failures (Graph API errors, DB errors)
 * so processWebhookEventRow marks the row failed and the cron retries it.
 * Return {processed:false} only for permanent conditions (missing id, dupe).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken } from "@/lib/auth/token-crypto";
import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { upsertRestrictedContact } from "@/lib/smarttalk/contact-privacy";

const META_GRAPH_URL = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;

export type LeadgenChannel = {
  id: string;
  organization_id: string;
  brand_id: string;
  type: string;
  access_token: string | null;
  access_token_ciphertext: string | null;
};

export type LeadgenChangeValue = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  adgroup_id?: string;
  ad_id?: string;
  created_time?: number | string;
};

export type GraphLead = {
  id?: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  is_organic?: boolean;
  platform?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
  error?: { message?: string; code?: number };
};

// custom_fields keys the platform already uses for other things — lead form
// answers must never clobber them.
const RESERVED_KEYS = new Set([
  "lifecycle",
  "assigned_to",
  "quota_restricted",
  "requires_upgrade",
  "source",
  "leadgen_id",
]);

function slugifyKey(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return RESERVED_KEYS.has(slug) ? `fb_${slug}` : slug;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const bare = digits.replace(/\+/g, "");
  if (bare.length < 7 || bare.length > 30) return null;
  return digits.startsWith("+") ? `+${bare}` : bare;
}

export const LEAD_GRAPH_FIELDS =
  "id,created_time,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,is_organic,platform,field_data";

export type LeadIngestResult = {
  processed: boolean;
  contactId?: string;
  restricted?: boolean;
  duplicate?: boolean;
};

export async function processLeadgenChange(
  channel: LeadgenChannel,
  value: LeadgenChangeValue
): Promise<LeadIngestResult> {
  const leadgenId = String(value.leadgen_id || "").trim();
  if (!leadgenId) return { processed: false };

  const admin = createAdminClient("smarttalk");

  // Dedupe: Meta redelivers webhook events.
  const { data: duplicate } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", channel.organization_id)
    .eq("brand_id", channel.brand_id)
    .contains("custom_fields", { leadgen_id: leadgenId })
    .maybeSingle();
  if (duplicate?.id) {
    return { processed: false, duplicate: true, contactId: duplicate.id as string };
  }

  const token = resolveToken(channel.access_token_ciphertext, channel.access_token);
  if (!token) {
    throw new Error(`[leadgen] channel ${channel.id} has no usable page token`);
  }

  const res = await fetch(
    `${META_GRAPH_URL}/${encodeURIComponent(leadgenId)}?fields=${LEAD_GRAPH_FIELDS}&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(15_000) }
  );
  const lead = (await res.json().catch(() => null)) as GraphLead | null;
  if (!res.ok || !lead || lead.error) {
    throw new Error(
      `[leadgen] Graph fetch failed for ${leadgenId}: HTTP ${res.status} ${lead?.error?.message || ""}`
    );
  }

  return ingestGraphLead(channel, lead, { pageId: value.page_id, adId: value.ad_id, formId: value.form_id });
}

/**
 * Upserts a CRM contact from a full Graph lead object. Shared by the webhook
 * path (processLeadgenChange) and the historical sync endpoint.
 */
export async function ingestGraphLead(
  channel: LeadgenChannel,
  lead: GraphLead,
  extras: { pageId?: string; adId?: string; formId?: string } = {}
): Promise<LeadIngestResult> {
  const leadgenId = String(lead.id || "").trim();
  if (!leadgenId) return { processed: false };

  const admin = createAdminClient("smarttalk");
  const value = {
    page_id: extras.pageId,
    ad_id: extras.adId,
    form_id: extras.formId,
  };

  // Dedupe by leadgen_id (webhook redeliveries and repeated syncs).
  const { data: duplicate } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", channel.organization_id)
    .eq("brand_id", channel.brand_id)
    .contains("custom_fields", { leadgen_id: leadgenId })
    .maybeSingle();
  if (duplicate?.id) {
    return { processed: false, duplicate: true, contactId: duplicate.id as string };
  }

  // Map answers. Keep every answer under its slugified question name and
  // additionally extract the common identity fields.
  let email: string | null = null;
  let phone: string | null = null;
  let fullName: string | null = null;
  const answers: Record<string, string> = {};
  for (const field of lead.field_data || []) {
    const name = String(field?.name || "").trim();
    const answer = (field?.values || []).filter(Boolean).join(", ").trim();
    if (!name || !answer) continue;
    answers[slugifyKey(name)] = answer;
    if (!email && /e-?mail|correo/i.test(name)) email = answer.toLowerCase();
    if (!phone && /phone|tel[eé]fono|celular|whatsapp|m[oó]vil/i.test(name)) {
      phone = normalizePhone(answer);
    }
    if (!fullName && /full.?name|nombre/i.test(name)) fullName = answer;
  }

  const waId = phone || email || `lead:${leadgenId}`;
  const leadMeta: Record<string, string> = {
    source: "facebook_lead_form",
    leadgen_id: leadgenId,
  };
  if (email) leadMeta.email = email;
  if (phone) leadMeta.phone = phone;
  if (lead.form_id || value.form_id) leadMeta.lead_form_id = String(lead.form_id || value.form_id);
  if (value.page_id) leadMeta.lead_page_id = String(value.page_id);
  if (lead.campaign_name) leadMeta.lead_campaign = lead.campaign_name;
  else if (lead.campaign_id) leadMeta.lead_campaign = lead.campaign_id;
  if (lead.ad_name) leadMeta.lead_ad = lead.ad_name;
  else if (lead.ad_id || value.ad_id) leadMeta.lead_ad = String(lead.ad_id || value.ad_id);
  if (lead.platform) leadMeta.lead_platform = lead.platform;
  if (typeof lead.is_organic === "boolean") {
    leadMeta.lead_organic = lead.is_organic ? "sí" : "no";
  }
  if (lead.created_time) leadMeta.lead_created_time = lead.created_time;

  const customFields = { ...answers, ...leadMeta };
  const nowIso = new Date().toISOString();

  const { data: existing } = await admin
    .from("contacts")
    .select("id, name, tags, custom_fields, visibility_status")
    .eq("organization_id", channel.organization_id)
    .eq("brand_id", channel.brand_id)
    .eq("wa_id", waId)
    .maybeSingle();

  if (existing?.id) {
    if (existing.visibility_status === "restricted") {
      await admin
        .from("contacts")
        .update({ last_message_at: nowIso })
        .eq("id", existing.id);
      return { processed: true, contactId: existing.id as string, restricted: true };
    }
    const mergedTags = Array.from(
      new Set([...(existing.tags || []), "facebook-lead"])
    );
    const { error: updateError } = await admin
      .from("contacts")
      .update({
        name: existing.name || fullName || undefined,
        tags: mergedTags,
        custom_fields: {
          ...(existing.custom_fields as Record<string, string> | null),
          ...customFields,
        },
        last_message_at: nowIso,
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return { processed: true, contactId: existing.id as string };
  }

  const billingDecision = await checkBillingFeature({
    organizationId: channel.organization_id,
    featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
    requestedUnits: 1,
    source: "webhook/facebook/leadgen",
  });
  if (!billingDecision.allowed) {
    const restrictedContact = await upsertRestrictedContact({
      organizationId: channel.organization_id,
      brandId: channel.brand_id,
      channelId: channel.id,
      externalContactId: waId,
      name: fullName || undefined,
    });
    console.warn("[billing] leadgen contact over limit; lead preserved restricted", {
      organizationId: channel.organization_id,
      brandId: channel.brand_id,
      leadgenId,
    });
    return { processed: true, contactId: restrictedContact.id, restricted: true };
  }

  const { data: inserted, error: insertError } = await admin
    .from("contacts")
    .insert({
      organization_id: channel.organization_id,
      brand_id: channel.brand_id,
      wa_id: waId,
      name: fullName || email || waId,
      tags: ["facebook-lead"],
      custom_fields: customFields,
      last_message_at: nowIso,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  return { processed: true, contactId: inserted?.id as string };
}
