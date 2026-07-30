import { NextRequest } from "next/server";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingDeniedResponse,
  checkBillingFeature,
} from "@/lib/billing/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function getRequester() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .maybeSingle();
  return agent || null;
}

export async function GET() {
  const requester = await getRequester();
  if (!requester) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const publicAdmin = createAdminClient("public");
  const [{ data: assignments, error }, { data: brands, error: brandsError }] =
    await Promise.all([
      admin
        .from("brand_advisor_assignments")
        .select("id, agent_id, brand_id")
        .eq("organization_id", requester.organization_id),
      publicAdmin
        .from("cm_clients")
        .select("id, name, status")
        .eq("smarttalk_organization_id", requester.organization_id)
        .order("name"),
    ]);

  if (error || brandsError) {
    return Response.json(
      { error: error?.message || brandsError?.message },
      { status: 500 }
    );
  }

  return Response.json({
    brands: brands || [],
    assignments: assignments || [],
  });
}

export async function PATCH(request: NextRequest) {
  const requester = await getRequester();
  if (!requester) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (requester.role !== "admin") {
    return Response.json(
      { error: "Solo un administrador puede cambiar el tipo de miembro." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    agent_id?: string;
    member_type?: string;
    brand_ids?: unknown;
  } | null;
  const agentId = String(body?.agent_id || "");
  const memberType =
    body?.member_type === "brand_advisor" ? "brand_advisor" : "agency_user";
  const brandIds = Array.isArray(body?.brand_ids)
    ? [
        ...new Set(
          body.brand_ids.filter((id): id is string => typeof id === "string")
        ),
      ]
    : [];

  if (!agentId) {
    return Response.json({ error: "Miembro requerido." }, { status: 400 });
  }
  if (agentId === requester.id) {
    return Response.json(
      { error: "No puedes cambiar tu propio tipo de miembro." },
      { status: 400 }
    );
  }
  if (memberType === "brand_advisor" && brandIds.length === 0) {
    return Response.json(
      { error: "Selecciona al menos una marca para el asesor." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const publicAdmin = createAdminClient("public");
  const { data: target } = await admin
    .from("agents")
    .select("id, member_type, role")
    .eq("id", agentId)
    .eq("organization_id", requester.organization_id)
    .maybeSingle();
  if (!target) {
    return Response.json({ error: "Miembro no encontrado." }, { status: 404 });
  }

  if (memberType === "brand_advisor") {
    const { data: brands, error } = await publicAdmin
      .from("cm_clients")
      .select("id")
      .eq("smarttalk_organization_id", requester.organization_id)
      .in("id", brandIds);
    if (error || (brands || []).length !== brandIds.length) {
      return Response.json(
        { error: "Una o más marcas no pertenecen a la agencia." },
        { status: 400 }
      );
    }
  }

  const { data: currentAssignments } = await admin
    .from("brand_advisor_assignments")
    .select("brand_id")
    .eq("agent_id", agentId);
  const currentBrandIds = new Set(
    (currentAssignments || []).map((assignment) => assignment.brand_id)
  );

  if (target.member_type !== memberType) {
    const decision = await checkBillingFeature({
      organizationId: requester.organization_id,
      featureCode:
        memberType === "brand_advisor"
          ? BILLING_FEATURES.BRAND_ADVISORS_TOTAL
          : BILLING_FEATURES.AGENCY_USERS,
      requestedUnits: 1,
      source: "api/agents/memberships",
    });
    if (!decision.allowed) return billingDeniedResponse(decision);
  }

  for (const brandId of brandIds.filter((id) => !currentBrandIds.has(id))) {
    const decision = await checkBillingFeature({
      organizationId: requester.organization_id,
      featureCode: BILLING_FEATURES.BRAND_ADVISORS_PER_BRAND,
      brandId,
      requestedUnits: 1,
      source: "api/agents/memberships",
    });
    if (!decision.allowed) return billingDeniedResponse(decision);
  }

  const { error: updateError } = await admin
    .from("agents")
    .update({
      member_type: memberType,
      ...(memberType === "brand_advisor" ? { role: "agent" } : {}),
    })
    .eq("id", agentId)
    .eq("organization_id", requester.organization_id);
  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("brand_advisor_assignments")
    .delete()
    .eq("agent_id", agentId);
  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  if (memberType === "brand_advisor") {
    const { error: insertError } = await admin
      .from("brand_advisor_assignments")
      .insert(
        brandIds.map((brandId) => ({
          organization_id: requester.organization_id,
          agent_id: agentId,
          brand_id: brandId,
          created_by: requester.id,
        }))
      );
    if (insertError) {
      await admin
        .from("agents")
        .update({ member_type: target.member_type, role: target.role })
        .eq("id", agentId);
      if (target.member_type === "brand_advisor" && currentBrandIds.size > 0) {
        await admin.from("brand_advisor_assignments").insert(
          [...currentBrandIds].map((brandId) => ({
            organization_id: requester.organization_id,
            agent_id: agentId,
            brand_id: brandId,
            created_by: requester.id,
          }))
        );
      }
      return Response.json({ error: insertError.message }, { status: 500 });
    }
  }

  return Response.json({
    success: true,
    member_type: memberType,
    brand_ids: memberType === "brand_advisor" ? brandIds : [],
  });
}
