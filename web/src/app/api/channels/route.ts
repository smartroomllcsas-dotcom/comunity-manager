import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  billingDeniedResponse,
  billingCapacityDeniedResponse,
  billingCapacityErrorResponse,
  checkBillingFeature,
  consumeBillingCapacity,
  releaseBillingCapacity,
  reserveBillingCapacity,
} from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  getAgentBrandIds,
  getBrandInOrganization,
} from "@/lib/smarttalk/brand-scope";

function canManageChannels(agent: {
  role: string;
  member_type?: string | null;
  is_super_admin?: boolean | null;
}) {
  return (
    agent.is_super_admin === true ||
    (agent.role === "admin" && agent.member_type === "agency_user") ||
    agent.member_type === "brand_admin"
  );
}

export async function GET() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const { data: channels, error } = await admin
    .from("channels")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .order("created_at", { ascending: false });

  const assignedBrandIds = await getAgentBrandIds(agent);
  const visibleChannels = assignedBrandIds
    ? (channels || []).filter((channel) => assignedBrandIds.includes(channel.brand_id))
    : channels;

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ channels: visibleChannels || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  if (!canManageChannels(agent)) {
    return Response.json({ error: "Solo los administradores pueden crear canales" }, { status: 403 });
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
    requestedUnits: 1,
    source: "api/channels",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  const body = await request.json();
  const { type, name, brandId, config } = body as {
    type: string;
    name: string;
    brandId: string;
    config?: Record<string, unknown>;
  };

  if (!type || !name || !brandId) {
    return Response.json({ error: "type, name y brandId son requeridos" }, { status: 400 });
  }

  const brand = await getBrandInOrganization(brandId, agent.organization_id);
  if (!brand) {
    return Response.json({ error: "La marca no pertenece a esta organización" }, { status: 403 });
  }
  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(brand.id)) {
    return Response.json({ error: "No autorizado para esta marca" }, { status: 403 });
  }

  const capacity = await reserveBillingCapacity({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
    requestedUnits: 1,
  });
  if (capacity.status === "denied") {
    return billingCapacityDeniedResponse(billingDecision, capacity);
  }
  if (capacity.status === "error") return billingCapacityErrorResponse();
  const reservationId = capacity.status === "reserved" ? capacity.reservationId : null;

  const { data: channel, error } = await admin
    .from("channels")
    .insert({
      organization_id: agent.organization_id,
      brand_id: brand.id,
      type,
      name,
      status: "pending",
      config: config || {},
    })
    .select()
    .single();

  if (error) {
    if (reservationId) await releaseBillingCapacity(reservationId);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (reservationId && !(await consumeBillingCapacity(reservationId, channel.id))) {
    await releaseBillingCapacity(reservationId);
  }

  return Response.json({ channel }, { status: 201 });
}
