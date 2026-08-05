import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingDeniedResponse, checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

type LegacySocialAccount = {
  id: string;
  client_id: string;
  meta_user_id: string;
  access_token: string | null;
  access_token_ciphertext: string | null;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
  page_access_token_ciphertext: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  business_id: string | null;
  connected_at: string;
  updated_at: string;
};

type SmarttalkChannel = {
  id: string;
  organization_id: string;
  brand_id: string;
  type: string;
  name: string;
  status: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_phone_number: string | null;
  access_token: string | null;
  facebook_app_id: string | null;
  meta_business_id: string | null;
  config: Record<string, unknown>;
  connected_at: string | null;
  last_active_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalize(name: string | null | undefined) {
  return (name || "").trim();
}

function buildFacebookName(account: LegacySocialAccount) {
  return normalize(account.page_name) || "Facebook";
}

function buildInstagramName(account: LegacySocialAccount) {
  return (
    normalize(account.instagram_username)
      ? `Instagram @${account.instagram_username}`
      : normalize(account.page_name) || "Instagram"
  );
}

async function getCurrentAgentOrganization() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!agent) {
    return { error: "Agent not found", status: 404 as const };
  }

  if (agent.role !== "admin") {
    return { error: "Solo los administradores pueden sincronizar canales", status: 403 as const };
  }

  return { organizationId: agent.organization_id };
}

export async function POST(_request: NextRequest) {
  const org = await getCurrentAgentOrganization();
  if ("error" in org) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const smarttalk = createAdminClient("smarttalk");
  const publicAdmin = createAdminClient("public");

  const { data: existingChannels, error: channelsError } = await smarttalk
    .from("channels")
    .select("*")
    .eq("organization_id", org.organizationId);

  if (channelsError) {
    return NextResponse.json({ error: channelsError.message }, { status: 500 });
  }

  const currentChannels = (existingChannels || []) as SmarttalkChannel[];
  let synced = 0;
  const results: Array<{ type: string; action: "inserted" | "updated" | "skipped"; name: string }> = [];

  const { data: brands, error: brandsError } = await publicAdmin
    .from("cm_clients")
    .select("id")
    .eq("smarttalk_organization_id", org.organizationId);

  if (brandsError) {
    return NextResponse.json({ error: brandsError.message }, { status: 500 });
  }

  const brandIds = (brands || []).map((brand) => brand.id as string);
  if (brandIds.length === 0) {
    return NextResponse.json({
      success: true,
      synced: 0,
      organization_id: org.organizationId,
      channels: currentChannels,
      results,
    });
  }

  const { data: socialRows, error: socialError } = await publicAdmin
    .from("cm_social_accounts")
    .select("id,client_id,meta_user_id,access_token,access_token_ciphertext,page_id,page_name,page_access_token,page_access_token_ciphertext,instagram_id,instagram_username,business_id,connected_at,updated_at")
    .in("client_id", brandIds);

  if (socialError) {
    return NextResponse.json({ error: socialError.message }, { status: 500 });
  }

  for (const account of (socialRows || []) as LegacySocialAccount[]) {
    if (account.page_id) {
      const existing = currentChannels.find((channel) =>
        channel.brand_id === account.client_id &&
        channel.type === "facebook_messenger" &&
        (channel.meta_business_id === account.page_id ||
          (channel.config as Record<string, unknown> | null)?.legacy_id === account.page_id)
      );
      const payload = {
        organization_id: org.organizationId,
        brand_id: account.client_id,
        type: "facebook_messenger",
        name: buildFacebookName(account),
        status: "active",
        whatsapp_phone_number_id: null,
        whatsapp_business_account_id: null,
        whatsapp_phone_number: null,
        access_token: account.page_access_token_ciphertext || account.access_token_ciphertext
          ? null
          : account.page_access_token || account.access_token || null,
        access_token_ciphertext: account.page_access_token_ciphertext || account.access_token_ciphertext || null,
        facebook_app_id: null,
        meta_business_id: account.business_id || account.page_id,
        config: {
          legacy_source: "cm_social_accounts",
          legacy_type: "facebook",
          legacy_id: account.page_id,
          legacy_client_id: account.client_id,
          legacy_account_id: account.id,
          page_name: account.page_name,
        },
        connected_at: account.connected_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await smarttalk.from("channels").update(payload).eq("id", existing.id);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        results.push({ type: "facebook_messenger", action: "updated", name: payload.name });
      } else {
        const billingDecision = await checkBillingFeature({
          organizationId: org.organizationId,
          featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
          requestedUnits: 1,
          source: "channels/sync-legacy/facebook",
        });
        if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

        const { error } = await smarttalk.from("channels").insert(payload);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        results.push({ type: "facebook_messenger", action: "inserted", name: payload.name });
      }
      synced += 1;
    }

    if (account.instagram_id || account.instagram_username) {
      const instagramLegacyId = account.instagram_id || account.instagram_username || account.id;
      const existing = currentChannels.find((channel) =>
        channel.brand_id === account.client_id &&
        channel.type === "instagram" &&
        ((channel.config as Record<string, unknown> | null)?.legacy_id === instagramLegacyId)
      );
      const payload = {
        organization_id: org.organizationId,
        brand_id: account.client_id,
        type: "instagram",
        name: buildInstagramName(account),
        status: "active",
        whatsapp_phone_number_id: null,
        whatsapp_business_account_id: null,
        whatsapp_phone_number: null,
        access_token: account.page_access_token_ciphertext || account.access_token_ciphertext
          ? null
          : account.page_access_token || account.access_token || null,
        access_token_ciphertext: account.page_access_token_ciphertext || account.access_token_ciphertext || null,
        facebook_app_id: null,
        meta_business_id: account.business_id || null,
        config: {
          legacy_source: "cm_social_accounts",
          legacy_type: "instagram",
          legacy_id: instagramLegacyId,
          legacy_client_id: account.client_id,
          legacy_account_id: account.id,
          instagram_username: account.instagram_username,
        },
        connected_at: account.connected_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await smarttalk.from("channels").update(payload).eq("id", existing.id);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        results.push({ type: "instagram", action: "updated", name: payload.name });
      } else {
        const billingDecision = await checkBillingFeature({
          organizationId: org.organizationId,
          featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
          requestedUnits: 1,
          source: "channels/sync-legacy/instagram",
        });
        if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

        const { error } = await smarttalk.from("channels").insert(payload);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        results.push({ type: "instagram", action: "inserted", name: payload.name });
      }
      synced += 1;
    }
  }

  const { data: postSyncChannels } = await smarttalk
    .from("channels")
    .select("*")
    .eq("organization_id", org.organizationId)
    .order("created_at", { ascending: false });

  const whatsappChannel = (postSyncChannels || []).find(
    (channel) => channel.type === "whatsapp_business_api"
  ) as SmarttalkChannel | undefined;

  if (whatsappChannel?.whatsapp_phone_number_id) {
    await smarttalk
      .from("organizations")
      .update({
        whatsapp_phone_number_id: whatsappChannel.whatsapp_phone_number_id,
        whatsapp_business_account_id: whatsappChannel.whatsapp_business_account_id,
        access_token: whatsappChannel.access_token,
      })
      .eq("id", org.organizationId);
  }

  return NextResponse.json({
    success: true,
    synced,
    organization_id: org.organizationId,
    channels: postSyncChannels || [],
    results,
  });
}
