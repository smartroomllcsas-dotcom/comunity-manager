import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRespondIoToken } from "@/lib/respond-io/api";
import type { RespondIoChannelSource } from "@/lib/respond-io/types";
import { getBrandInOrganization } from "@/lib/smarttalk/brand-scope";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { CHANNEL_PUBLIC_COLUMNS } from "@/lib/smarttalk/channel-public";
import { encryptToken } from "@/lib/auth/token-crypto";
import { billingDeniedResponse, checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

interface ConnectBody {
  name: string;
  apiToken: string;
  respondChannelId: string;
  respondChannelType: RespondIoChannelSource;
  workspaceId?: string;
  displayName?: string;
  webhookSecret?: string;
  brandId: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase.from("agents").select("*").eq("id", user.id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (agent.role !== "admin") {
    return NextResponse.json({ error: "Solo los administradores pueden conectar canales" }, { status: 403 });
  }

  const body = (await request.json()) as ConnectBody;
  const {
    name,
    apiToken,
    respondChannelId,
    respondChannelType,
    workspaceId,
    displayName,
    webhookSecret,
    brandId,
  } = body;

  if (!name || !apiToken || !respondChannelId || !respondChannelType || !brandId) {
    return NextResponse.json(
      { error: "name, apiToken, respondChannelId, respondChannelType y brandId son requeridos" },
      { status: 400 },
    );
  }
  const brand = await getBrandInOrganization(brandId, agent.organization_id);
  if (!brand) {
    return NextResponse.json({ error: "La marca no pertenece a esta organización" }, { status: 403 });
  }
  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(brand.id)) {
    return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
    requestedUnits: 1,
    source: "channels/respond-io/connect",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  const verification = await verifyRespondIoToken(apiToken);
  if (!verification.ok) {
    return NextResponse.json(
      { error: `Token de Respond.io invalido: ${verification.error}` },
      { status: 400 },
    );
  }

  const config = {
    respondChannelId,
    respondChannelType,
    workspaceId,
    displayName,
    webhookSecret,
  };

  const { data: channel, error } = await admin
    .from("channels")
    .insert({
      organization_id: agent.organization_id,
      brand_id: brand.id,
      type: "respond_io",
      name,
      status: "active",
      access_token: null,
      access_token_ciphertext: encryptToken(apiToken),
      respond_io_channel_id: respondChannelId,
      config,
      connected_at: new Date().toISOString(),
    })
    .select(CHANNEL_PUBLIC_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channel }, { status: 201 });
}
