import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandInOrganization } from "@/lib/smarttalk/brand-scope";
import { billingDeniedResponse, checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { wahaFromEnv } from "@/lib/waha/client";
import { sessionNameForBrand } from "@/lib/waha/session-name";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, member_type")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let body: { brandId?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { brandId, name } = body;
  if (!brandId || typeof brandId !== "string" || !brandId.trim()) {
    return NextResponse.json({ error: "brandId es requerido" }, { status: 400 });
  }

  const brand = await getBrandInOrganization(brandId, agent.organization_id);
  if (!brand) {
    return NextResponse.json({ error: "La marca no pertenece a esta organización" }, { status: 403 });
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
    requestedUnits: 1,
    source: "channels/waha/connect",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  let sessionName: string;
  try {
    sessionName = sessionNameForBrand(brandId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const hmac = process.env.WAHA_WEBHOOK_HMAC_SECRET;
  if (!hmac) {
    return NextResponse.json({ error: "server missing WAHA_WEBHOOK_HMAC_SECRET" }, { status: 500 });
  }

  const displayName = name?.trim() || "WhatsApp (WAHA · beta)";

  const { data: channel, error: channelError } = await admin
    .from("channels")
    .insert({
      organization_id: agent.organization_id,
      brand_id: brand.id,
      type: "waha",
      name: displayName,
      status: "pending",
      config: {
        sessionName,
        brandId,
        hmacSecretHint: "env:WAHA_WEBHOOK_HMAC_SECRET",
      },
    })
    .select()
    .single();

  if (channelError || !channel) {
    return NextResponse.json({ error: channelError?.message ?? "Failed to create channel" }, { status: 500 });
  }

  const { error: sessionError } = await admin
    .from("waha_sessions")
    .upsert(
      {
        channel_id: channel.id,
        session_name: sessionName,
        status: "STARTING",
      },
      { onConflict: "session_name" }
    );

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Build webhook URL
  let appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "https://www.comunitymanager.io";
  if (!/^https?:\/\//i.test(appUrl)) {
    appUrl = `https://${appUrl}`;
  }
  const webhookUrl = `${appUrl}/api/webhook/waha`;

  try {
    await wahaFromEnv().createSession({
      name: sessionName,
      webhookUrl,
      webhookHmacSecret: hmac,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await admin
      .from("channels")
      .update({ status: "error" })
      .eq("id", channel.id);

    await admin
      .from("waha_sessions")
      .update({ last_error: msg, status: "FAILED" })
      .eq("channel_id", channel.id);

    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json(
    { channelId: channel.id, sessionName, status: "STARTING" },
    { status: 201 }
  );
}
