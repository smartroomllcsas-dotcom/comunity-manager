import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  billingDeniedResponse,
  checkBillingFeature,
} from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

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

  const { data: invitations, error } = await admin
    .from("invitations")
    .select("*, inviter:agents!invited_by(name, email)")
    .eq("organization_id", agent.organization_id)
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

  return Response.json({
    invitations: (invitations || []).map((invitation) => ({
      ...invitation,
      brand_ids: (assignments || [])
        .filter((assignment) => assignment.invitation_id === invitation.id)
        .map((assignment) => assignment.brand_id),
    })),
  });
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

  if (agent.role !== "admin") {
    return Response.json({ error: "Only admins can invite team members" }, { status: 403 });
  }

  const body = (await request.json()) as {
    email?: string;
    role?: string;
    member_type?: string;
    brand_ids?: unknown;
  };
  const email = String(body.email || "").toLowerCase().trim();
  const memberType =
    body.member_type === "brand_advisor" ? "brand_advisor" : "agency_user";
  const role = memberType === "brand_advisor" ? "agent" : String(body.role || "");
  const brandIds = Array.isArray(body.brand_ids)
    ? [...new Set(body.brand_ids.filter((id): id is string => typeof id === "string"))]
    : [];

  if (!email || !role) {
    return Response.json({ error: "Email and role are required" }, { status: 400 });
  }

  if (!["admin", "supervisor", "agent"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  if (memberType === "brand_advisor" && brandIds.length === 0) {
    return Response.json(
      { error: "Selecciona al menos una marca para el asesor." },
      { status: 400 }
    );
  }

  if (memberType === "brand_advisor") {
    const publicAdmin = createAdminClient("public");
    const { data: brands, error: brandsError } = await publicAdmin
      .from("cm_clients")
      .select("id")
      .eq("smarttalk_organization_id", agent.organization_id)
      .in("id", brandIds);
    if (brandsError || (brands || []).length !== brandIds.length) {
      return Response.json(
        { error: "Una o más marcas no pertenecen a la agencia." },
        { status: 400 }
      );
    }
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode:
      memberType === "brand_advisor"
        ? BILLING_FEATURES.BRAND_ADVISORS_TOTAL
        : BILLING_FEATURES.AGENCY_USERS,
    requestedUnits: 1,
    source: "api/invitations",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  for (const brandId of brandIds) {
    const brandDecision = await checkBillingFeature({
      organizationId: agent.organization_id,
      featureCode: BILLING_FEATURES.BRAND_ADVISORS_PER_BRAND,
      brandId,
      requestedUnits: 1,
      source: "api/invitations",
    });
    if (!brandDecision.allowed) return billingDeniedResponse(brandDecision);
  }

  // Check if agent with this email already exists in the org
  const { data: existing } = await admin
    .from("agents")
    .select("id")
    .eq("organization_id", agent.organization_id)
    .eq("email", email)
    .single();

  if (existing) {
    return Response.json({ error: "This email already belongs to a team member" }, { status: 409 });
  }

  // Check if there's already a pending invitation
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id")
    .eq("organization_id", agent.organization_id)
    .eq("email", email)
    .eq("status", "pending")
    .single();

  if (existingInvite) {
    return Response.json({ error: "There is already a pending invitation for this email" }, { status: 409 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: invitation, error } = await admin
    .from("invitations")
    .insert({
      organization_id: agent.organization_id,
      email,
      role,
      member_type: memberType,
      invited_by: agent.id,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (memberType === "brand_advisor") {
    const { error: assignmentError } = await admin
      .from("invitation_brand_assignments")
      .insert(
        brandIds.map((brandId) => ({
          organization_id: agent.organization_id,
          invitation_id: invitation.id,
          brand_id: brandId,
        }))
      );
    if (assignmentError) {
      await admin.from("invitations").delete().eq("id", invitation.id);
      return Response.json({ error: assignmentError.message }, { status: 500 });
    }
  }

  return Response.json(
    { invitation: { ...invitation, brand_ids: brandIds } },
    { status: 201 }
  );
}
