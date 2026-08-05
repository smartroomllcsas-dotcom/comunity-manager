"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { redirect } from "next/navigation";

export async function getInvitation(token: string) {
  const admin = createAdminClient();

  const { data: invitation, error } = await admin
    .from("invitations")
    .select("id, email, role, member_type, status, expires_at, organization_id, organizations(name)")
    .eq("id", token)
    .single();

  if (error || !invitation) {
    return { error: "Invitacion no encontrada" };
  }

  if (invitation.status !== "pending") {
    return { error: "Esta invitacion ya fue utilizada" };
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { error: "Esta invitacion ha expirado" };
  }

  const { data: brandAssignments } = await admin
    .from("invitation_brand_assignments")
    .select("brand_id")
    .eq("invitation_id", invitation.id);

  return {
    data: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      memberType: invitation.member_type,
      brandIds: (brandAssignments || []).map((assignment) => assignment.brand_id),
      orgName: (invitation.organizations as unknown as { name: string } | null)?.name ?? "",
      organizationId: invitation.organization_id,
    },
  };
}

export async function acceptInvitation(token: string, formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const name = formData.get("name") as string;
  const password = formData.get("password") as string;

  // Re-validate the invitation
  const { data: invitation, error: invError } = await admin
    .from("invitations")
    .select("id, email, role, member_type, status, expires_at, organization_id, invited_by")
    .eq("id", token)
    .eq("status", "pending")
    .single();

  if (invError || !invitation) {
    return { error: "Invitacion no valida o ya fue utilizada" };
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { error: "Esta invitacion ha expirado" };
  }

  const { data: brandAssignments } = await admin
    .from("invitation_brand_assignments")
    .select("brand_id")
    .eq("invitation_id", invitation.id);
  const isBrandScopedMember =
    invitation.member_type === "brand_admin" ||
    invitation.member_type === "brand_advisor";
  if (isBrandScopedMember && (!brandAssignments || brandAssignments.length === 0)) {
    return { error: "La invitacion no tiene una marca asignada" };
  }
  if (invitation.member_type === "brand_admin" && (brandAssignments?.length ?? 0) !== 1) {
    return { error: "El administrador de marca debe tener una única marca asignada" };
  }

  const featureCode =
    invitation.member_type === "brand_advisor"
      ? BILLING_FEATURES.BRAND_ADVISORS_TOTAL
      : invitation.member_type === "agency_user"
        ? BILLING_FEATURES.AGENCY_USERS
        : null;
  if (featureCode) {
    const decision = await checkBillingFeature({
      organizationId: invitation.organization_id,
      featureCode,
      excludeInvitationId: invitation.id,
      source: "invite/accept",
    });
    if (!decision.allowed) {
      return { error: "El límite del plan ya fue alcanzado. La agencia debe ampliar el plan antes de activar esta invitación." };
    }
  }
  if (invitation.member_type === "brand_advisor") {
    for (const assignment of brandAssignments || []) {
      const decision = await checkBillingFeature({
        organizationId: invitation.organization_id,
        featureCode: BILLING_FEATURES.BRAND_ADVISORS_PER_BRAND,
        brandId: assignment.brand_id,
        excludeInvitationId: invitation.id,
        source: "invite/accept",
      });
      if (!decision.allowed) {
        return { error: "El límite de asesores de esta marca ya fue alcanzado." };
      }
    }
  }

  // Create the auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: invitation.email,
    password,
  });

  if (authError || !authData.user) {
    return { error: authError?.message || "Error al crear usuario" };
  }

  // Create agent linked to the invitation's organization
  const { error: agentError } = await admin.from("agents").insert({
    id: authData.user.id,
    organization_id: invitation.organization_id,
    name,
    email: invitation.email,
    role: invitation.role,
    member_type: invitation.member_type,
    status: "online",
  });

  if (agentError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: "Error al crear agente" };
  }

  if (isBrandScopedMember) {
    const { error: assignmentError } = await admin
      .from("brand_advisor_assignments")
      .insert(
        (brandAssignments || []).map((assignment) => ({
          organization_id: invitation.organization_id,
          agent_id: authData.user!.id,
          brand_id: assignment.brand_id,
          created_by: invitation.invited_by,
        }))
      );
    if (assignmentError) {
      await admin.from("agents").delete().eq("id", authData.user.id);
      await admin.auth.admin.deleteUser(authData.user.id);
      return { error: "Error asignando las marcas al miembro" };
    }
  }

  // Mark invitation as accepted
  await admin
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", token);

  redirect("/inbox");
}
