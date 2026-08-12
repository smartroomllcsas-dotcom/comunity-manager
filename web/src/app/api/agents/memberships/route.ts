import { NextRequest } from "next/server";
import { filterPausedBrandIds } from "@/lib/smarttalk/intake-guard";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingDeniedResponse,
  checkBillingFeature,
} from "@/lib/billing/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getAgentBrandIds,
  isBrandScopedMember,
} from "@/lib/smarttalk/brand-scope";

type MemberType = "agency_user" | "brand_admin" | "brand_advisor";

function normalizeMemberType(value: unknown): MemberType {
  if (value === "brand_admin") return "brand_admin";
  if (value === "brand_advisor") return "brand_advisor";
  return "agency_user";
}

function isAgencyAdmin(agent: {
  role: string;
  member_type?: string | null;
  is_super_admin?: boolean | null;
}) {
  return (
    agent.is_super_admin === true ||
    (agent.role === "admin" && agent.member_type === "agency_user")
  );
}

async function getRequester() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, organization_id, role, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  return agent || null;
}

async function validateBrandIds(
  organizationId: string,
  brandIds: string[]
) {
  if (brandIds.length === 0) return true;
  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from("cm_clients")
    .select("id")
    .eq("smarttalk_organization_id", organizationId)
    .in("id", brandIds);
  return !error && (data || []).length === brandIds.length;
}

async function brandAlreadyHasAdministrator(
  organizationId: string,
  brandId: string,
  excludedAgentId?: string
) {
  const admin = createAdminClient();
  const { data: assignments, error } = await admin
    .from("brand_advisor_assignments")
    .select("agent_id")
    .eq("organization_id", organizationId)
    .eq("brand_id", brandId);
  if (error) throw error;

  const agentIds = (assignments || [])
    .map((assignment) => assignment.agent_id as string)
    .filter((id) => id !== excludedAgentId);
  if (agentIds.length === 0) return false;

  const { data: administrators, error: administratorsError } = await admin
    .from("agents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("member_type", "brand_admin")
    .in("id", agentIds);
  if (administratorsError) throw administratorsError;
  return (administrators || []).length > 0;
}

export async function GET() {
  const requester = await getRequester();
  if (!requester) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const publicAdmin = createAdminClient("public");
  const accessibleBrandIds = await getAgentBrandIds(requester);
  if (accessibleBrandIds && accessibleBrandIds.length === 0) {
    return Response.json({ brands: [], assignments: [] });
  }

  let assignmentsQuery = admin
    .from("brand_advisor_assignments")
    .select("id, agent_id, brand_id")
    .eq("organization_id", requester.organization_id);
  let brandsQuery = publicAdmin
    .from("cm_clients")
    .select("id, name, status")
    .eq("smarttalk_organization_id", requester.organization_id)
    .order("name");

  if (accessibleBrandIds) {
    assignmentsQuery = assignmentsQuery.in("brand_id", accessibleBrandIds);
    brandsQuery = brandsQuery.in("id", accessibleBrandIds);
  }

  const [{ data: assignments, error }, { data: brands, error: brandsError }] =
    await Promise.all([assignmentsQuery, brandsQuery]);

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

  const requesterIsAgencyAdmin = isAgencyAdmin(requester);
  const requesterIsBrandAdmin = requester.member_type === "brand_admin";
  if (!requesterIsAgencyAdmin && !requesterIsBrandAdmin) {
    return Response.json(
      { error: "Solo un administrador de agencia o de marca puede gestionar asesores." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    agent_id?: string;
    member_type?: string;
    brand_ids?: unknown;
  } | null;
  const agentId = String(body?.agent_id || "");
  const memberType = normalizeMemberType(body?.member_type);
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
  if (isBrandScopedMember({ member_type: memberType }) && brandIds.length === 0) {
    return Response.json(
      { error: "Selecciona al menos una marca para el miembro." },
      { status: 400 }
    );
  }
  if (memberType === "brand_admin" && brandIds.length !== 1) {
    return Response.json(
      { error: "Un administrador de marca debe estar asignado a una única marca." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("agents")
    .select("id, member_type, role")
    .eq("id", agentId)
    .eq("organization_id", requester.organization_id)
    .maybeSingle();
  if (!target) {
    return Response.json({ error: "Miembro no encontrado." }, { status: 404 });
  }

  const requesterBrandIds = await getAgentBrandIds(requester);
  if (requesterIsBrandAdmin) {
    if (target.member_type !== "brand_advisor" || memberType !== "brand_advisor") {
      return Response.json(
        { error: "Un administrador de marca solo puede gestionar asesores de su marca." },
        { status: 403 }
      );
    }
    if (!requesterBrandIds || !brandIds.every((id) => requesterBrandIds.includes(id))) {
      return Response.json(
        { error: "Solo puedes asignar asesores a tu propia marca." },
        { status: 403 }
      );
    }
  }

  if (
    isBrandScopedMember({ member_type: memberType }) &&
    !(await validateBrandIds(requester.organization_id, brandIds))
  ) {
    return Response.json(
      { error: "Una o más marcas no pertenecen a la agencia." },
      { status: 400 }
    );
  }

  if (
    memberType === "brand_admin" &&
    (await brandAlreadyHasAdministrator(
      requester.organization_id,
      brandIds[0],
      target.id
    ))
  ) {
    return Response.json(
      { error: "Esta marca ya tiene un administrador asignado." },
      { status: 409 }
    );
  }

  const { data: currentAssignments, error: currentAssignmentsError } = await admin
    .from("brand_advisor_assignments")
    .select("brand_id")
    .eq("agent_id", agentId);
  if (currentAssignmentsError) {
    return Response.json({ error: currentAssignmentsError.message }, { status: 500 });
  }
  const currentBrandIds = new Set(
    (currentAssignments || []).map((assignment) => assignment.brand_id as string)
  );

  if (target.member_type !== memberType) {
    const featureCode =
      memberType === "brand_advisor"
        ? BILLING_FEATURES.BRAND_ADVISORS_TOTAL
        : memberType === "agency_user"
        ? BILLING_FEATURES.AGENCY_USERS
        : null;
    if (featureCode) {
      const decision = await checkBillingFeature({
        organizationId: requester.organization_id,
        featureCode,
        requestedUnits: 1,
        source: "api/agents/memberships",
      });
      if (!decision.allowed) return billingDeniedResponse(decision);
    }
  }

  // Un asesor no recibe asignaciones nuevas de una marca inactiva. Las
  // asignaciones que ya existían NO se tocan: se conservan para que la
  // reactivación devuelva el equipo tal como estaba.
  const newBrandIds = brandIds.filter((id) => !currentBrandIds.has(id));
  if (newBrandIds.length > 0) {
    const pausedTargets = await filterPausedBrandIds(newBrandIds);
    if (pausedTargets.size > 0) {
      return Response.json(
        {
          error: "inactive_brand",
          message: "No se pueden asignar asesores a una marca inactiva.",
          brandIds: [...pausedTargets],
        },
        { status: 409 }
      );
    }
  }

  if (memberType === "brand_advisor") {
    const brandIdsToCheck =
      target.member_type === "brand_advisor"
        ? brandIds.filter((id) => !currentBrandIds.has(id))
        : brandIds;
    for (const brandId of brandIdsToCheck) {
      const decision = await checkBillingFeature({
        organizationId: requester.organization_id,
        featureCode: BILLING_FEATURES.BRAND_ADVISORS_PER_BRAND,
        brandId,
        requestedUnits: 1,
        source: "api/agents/memberships",
      });
      if (!decision.allowed) return billingDeniedResponse(decision);
    }
  }

  // Clear old assignments before changing into brand_admin: the database trigger
  // guarantees that an administrator cannot keep multiple legacy assignments.
  const { error: deleteError } = await admin
    .from("brand_advisor_assignments")
    .delete()
    .eq("agent_id", agentId);
  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  const nextRole =
    memberType === "brand_advisor"
      ? "agent"
      : memberType === "brand_admin"
      ? "supervisor"
      : target.role;
  const { error: updateError } = await admin
    .from("agents")
    .update({ member_type: memberType, role: nextRole })
    .eq("id", agentId)
    .eq("organization_id", requester.organization_id);
  if (updateError) {
    await admin.from("brand_advisor_assignments").insert(
      [...currentBrandIds].map((brandId) => ({
        organization_id: requester.organization_id,
        agent_id: agentId,
        brand_id: brandId,
        created_by: requester.id,
      }))
    );
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  if (isBrandScopedMember({ member_type: memberType })) {
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
      if (isBrandScopedMember(target) && currentBrandIds.size > 0) {
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
    brand_ids: isBrandScopedMember({ member_type: memberType }) ? brandIds : [],
  });
}
