"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

/**
 * Single dispatcher entry point. Works around @vercel/next@4.21.x lambda-grouping
 * defect that mis-attributes NEXT_MISSING_LAMBDA when 2+ Server Actions from the
 * same file are imported into a single Client Component.
 */
export async function invitationAction(
  type: "get",
  token: string,
): Promise<Awaited<ReturnType<typeof getInvitation>>>;
export async function invitationAction(
  type: "accept",
  token: string,
  formData: FormData,
): Promise<Awaited<ReturnType<typeof acceptInvitation>>>;
export async function invitationAction(
  type: "get" | "accept",
  token: string,
  formData?: FormData,
) {
  if (type === "get") return getInvitation(token);
  return acceptInvitation(token, formData!);
}

async function getInvitation(token: string) {
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

async function acceptInvitation(token: string, formData: FormData) {
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

  // Create the auth user pre-confirmed (signUp depends on the project's
  // email-confirmation setting: with it enabled the invitee gets no session
  // and the login fails with "Email not confirmed" — bad first experience).
  let userId: string;
  let isNewAuthUser = false;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (created?.user) {
    userId = created.user.id;
    isNewAuthUser = true;
  } else {
    // The email may already have an account (e.g. a previous half-finished
    // accept). Let them through only if the password matches that account.
    const { data: signin, error: signinError } = await supabase.auth.signInWithPassword({
      email: invitation.email,
      password,
    });
    if (signinError || !signin.user) {
      return {
        error:
          "Este correo ya tiene una cuenta y la contraseña no coincide. Inicia sesión con tu contraseña habitual o recupérala. Detalle: " +
          (createError?.message || signinError?.message || "desconocido"),
      };
    }
    userId = signin.user.id;
  }

  // Create agent linked to the invitation's organization
  const { error: agentError } = await admin.from("agents").insert({
    id: userId,
    organization_id: invitation.organization_id,
    name,
    email: invitation.email,
    role: invitation.role,
    member_type: invitation.member_type,
    status: "online",
  });

  if (agentError) {
    if (isNewAuthUser) await admin.auth.admin.deleteUser(userId);
    return { error: "Error al crear agente" };
  }

  if (isBrandScopedMember) {
    const { error: assignmentError } = await admin
      .from("brand_advisor_assignments")
      .insert(
        (brandAssignments || []).map((assignment) => ({
          organization_id: invitation.organization_id,
          agent_id: userId,
          brand_id: assignment.brand_id,
          created_by: invitation.invited_by,
        }))
      );
    if (assignmentError) {
      await admin.from("agents").delete().eq("id", userId);
      if (isNewAuthUser) await admin.auth.admin.deleteUser(userId);
      return { error: "Error asignando las marcas al miembro" };
    }
  }

  // Mark invitation as accepted
  await admin
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", token);

  // Establish the session on this response's cookies so the redirect lands
  // authenticated. If it fails, the account still exists — send to /login.
  if (isNewAuthUser) {
    const { error: signinError } = await supabase.auth.signInWithPassword({
      email: invitation.email,
      password,
    });
    if (signinError) {
      return { success: true as const, redirectTo: "/login?invited=1" };
    }
  }

  return { success: true as const, redirectTo: "/inbox" };
}
