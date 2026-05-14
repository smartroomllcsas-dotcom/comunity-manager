"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function getInvitation(token: string) {
  const admin = createAdminClient();

  const { data: invitation, error } = await admin
    .from("invitations")
    .select("id, email, role, status, expires_at, organization_id, organizations(name)")
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

  return {
    data: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
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
    .select("id, email, role, status, expires_at, organization_id")
    .eq("id", token)
    .eq("status", "pending")
    .single();

  if (invError || !invitation) {
    return { error: "Invitacion no valida o ya fue utilizada" };
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { error: "Esta invitacion ha expirado" };
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
    status: "online",
  });

  if (agentError) {
    return { error: "Error al crear agente" };
  }

  // Mark invitation as accepted
  await admin
    .from("invitations")
    .update({ status: "accepted" })
    .eq("id", token);

  redirect("/inbox");
}
