import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  billingDeniedResponse,
  checkBillingFeature,
} from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { getAgentBrandIds, isBrandScopedMember } from "@/lib/smarttalk/brand-scope";
import { sendInvitationEmail } from "@/lib/notify/invitation-email";

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

async function validateBrandIds(organizationId: string, brandIds: string[]) {
  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from("cm_clients")
    .select("id")
    .eq("smarttalk_organization_id", organizationId)
    .in("id", brandIds);
  return !error && (data || []).length === brandIds.length;
}

async function brandHasAdministratorOrPendingInvitation(
  organizationId: string,
  brandId: string
) {
  const admin = createAdminClient();
  const { data: assignments } = await admin
    .from("brand_advisor_assignments")
    .select("agent_id")
    .eq("organization_id", organizationId)
    .eq("brand_id", brandId);
  const agentIds = (assignments || []).map((assignment) => assignment.agent_id as string);
  if (agentIds.length > 0) {
    const { data: existingAdmins } = await admin
      .from("agents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("member_type", "brand_admin")
      .in("id", agentIds);
    if ((existingAdmins || []).length > 0) return true;
  }

  const { data: invitationAssignments } = await admin
    .from("invitation_brand_assignments")
    .select("invitation_id")
    .eq("organization_id", organizationId)
    .eq("brand_id", brandId);
  const invitationIds = (invitationAssignments || []).map(
    (assignment) => assignment.invitation_id as string
  );
  if (invitationIds.length === 0) return false;

  const { data: pendingAdmins } = await admin
    .from("invitations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("member_type", "brand_admin")
    .eq("status", "pending")
    .in("id", invitationIds);
  return (pendingAdmins || []).length > 0;
}

export async function GET() {
  const requester = await getRequester();
  if (!requester) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const requesterBrandIds = await getAgentBrandIds(requester);
  const { data: invitations, error } = await admin
    .from("invitations")
    .select("*, inviter:agents!invited_by(name, email)")
    .eq("organization_id", requester.organization_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const invitationIds = (invitations || []).map((invitation) => invitation.id);
  const { data: assignments } = invitationIds.length
    ? await admin
        .from("invitation_brand_assignments")
        .select("invitation_id, brand_id")
        .in("invitation_id", invitationIds)
    : { data: [] };

  const visible = (invitations || []).filter((invitation) => {
    if (!requesterBrandIds) return true;
    if (invitation.member_type !== "brand_advisor") return false;
    const invitationBrandIds = (assignments || [])
      .filter((assignment) => assignment.invitation_id === invitation.id)
      .map((assignment) => assignment.brand_id as string);
    return invitationBrandIds.some((brandId) => requesterBrandIds.includes(brandId));
  });

  return Response.json({
    invitations: visible.map((invitation) => ({
      ...invitation,
      brand_ids: (assignments || [])
        .filter((assignment) => assignment.invitation_id === invitation.id)
        .map((assignment) => assignment.brand_id),
    })),
  });
}

export async function POST(request: NextRequest) {
  const requester = await getRequester();
  if (!requester) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const requesterIsAgencyAdmin = isAgencyAdmin(requester);
  const requesterIsBrandAdmin = requester.member_type === "brand_admin";
  if (!requesterIsAgencyAdmin && !requesterIsBrandAdmin) {
    return Response.json({ error: "Only administrators can invite team members" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    role?: string;
    member_type?: string;
    brand_ids?: unknown;
  } | null;
  const email = String(body?.email || "").toLowerCase().trim();
  const memberType = normalizeMemberType(body?.member_type);
  const brandIds = Array.isArray(body?.brand_ids)
    ? [...new Set(body.brand_ids.filter((id): id is string => typeof id === "string"))]
    : [];
  const role =
    memberType === "brand_advisor"
      ? "agent"
      : memberType === "brand_admin"
      ? "supervisor"
      : String(body?.role || "");

  if (!email || !role) {
    return Response.json({ error: "Email and role are required" }, { status: 400 });
  }
  if (!["admin", "supervisor", "agent"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
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

  const requesterBrandIds = await getAgentBrandIds(requester);
  if (requesterIsBrandAdmin) {
    if (memberType !== "brand_advisor") {
      return Response.json(
        { error: "Un administrador de marca solo puede invitar asesores." },
        { status: 403 }
      );
    }
    if (!requesterBrandIds || !brandIds.every((brandId) => requesterBrandIds.includes(brandId))) {
      return Response.json(
        { error: "Solo puedes invitar asesores a tu propia marca." },
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
    (await brandHasAdministratorOrPendingInvitation(requester.organization_id, brandIds[0]))
  ) {
    return Response.json(
      { error: "Esta marca ya tiene un administrador asignado o pendiente." },
      { status: 409 }
    );
  }

  const featureCode =
    memberType === "brand_advisor"
      ? BILLING_FEATURES.BRAND_ADVISORS_TOTAL
      : memberType === "agency_user"
      ? BILLING_FEATURES.AGENCY_USERS
      : null;
  if (featureCode) {
    const billingDecision = await checkBillingFeature({
      organizationId: requester.organization_id,
      featureCode,
      requestedUnits: 1,
      source: "api/invitations",
    });
    if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);
  }

  if (memberType === "brand_advisor") {
    for (const brandId of brandIds) {
      const brandDecision = await checkBillingFeature({
        organizationId: requester.organization_id,
        featureCode: BILLING_FEATURES.BRAND_ADVISORS_PER_BRAND,
        brandId,
        requestedUnits: 1,
        source: "api/invitations",
      });
      if (!brandDecision.allowed) return billingDeniedResponse(brandDecision);
    }
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("agents")
    .select("id")
    .eq("organization_id", requester.organization_id)
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return Response.json({ error: "This email already belongs to a team member" }, { status: 409 });
  }

  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id")
    .eq("organization_id", requester.organization_id)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existingInvite) {
    return Response.json({ error: "There is already a pending invitation for this email" }, { status: 409 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const { data: invitation, error } = await admin
    .from("invitations")
    .insert({
      organization_id: requester.organization_id,
      email,
      role,
      member_type: memberType,
      invited_by: requester.id,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (isBrandScopedMember({ member_type: memberType })) {
    const { error: assignmentError } = await admin
      .from("invitation_brand_assignments")
      .insert(
        brandIds.map((brandId) => ({
          organization_id: requester.organization_id,
          invitation_id: invitation.id,
          brand_id: brandId,
        }))
      );
    if (assignmentError) {
      await admin.from("invitations").delete().eq("id", invitation.id);
      return Response.json({ error: assignmentError.message }, { status: 500 });
    }
  }

  // Send the invitation email (best-effort: the invitation is already
  // created, so a mail failure must not fail the request — the UI can
  // still share the link manually).
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
  const inviteUrl = `${appUrl.replace(/\/$/, "")}/invite/${invitation.id}`;

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", requester.organization_id)
    .maybeSingle();
  const orgName = org?.name || "Community Manager";

  const emailResult = await sendInvitationEmail({
    to: email,
    orgName,
    inviteUrl,
    expiresAt,
  });
  if (!emailResult.ok) {
    console.error("[invitations] email send failed:", emailResult.error);
  }

  return Response.json(
    {
      invitation: { ...invitation, brand_ids: brandIds },
      email_sent: emailResult.ok,
      ...(emailResult.ok ? {} : { email_error: emailResult.error }),
    },
    { status: 201 }
  );
}
