import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { billingDeniedResponse, checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

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

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    return Response.json({ error: "Solo los administradores pueden cambiar el estado de los canales" }, { status: 403 });
  }

  // Verify channel belongs to same org
  const { data: channel } = await admin
    .from("channels")
    .select("*")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!channel) {
    return Response.json({ error: "Canal no encontrado" }, { status: 404 });
  }
  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(channel.brand_id)) {
    return Response.json({ error: "No autorizado para este canal" }, { status: 403 });
  }

  const newStatus = channel.status === "active" ? "disconnected" : "active";

  if (newStatus === "active") {
    const billingDecision = await checkBillingFeature({
      organizationId: agent.organization_id,
      featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
      requestedUnits: 1,
      source: "channels/toggle",
    });
    if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);
  }

  const { data: updated, error } = await admin
    .from("channels")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ channel: updated });
}
