import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";
import { sendInvitationEmail } from "@/lib/notify/invitation-email";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const isAgencyAdmin =
    agent.is_super_admin === true ||
    (agent.role === "admin" && agent.member_type === "agency_user");
  const isBrandAdmin = agent.member_type === "brand_admin";
  if (!isAgencyAdmin && !isBrandAdmin) {
    return Response.json(
      { error: "Only admins can resend invitations" },
      { status: 403 }
    );
  }

  const { data: invitation } = await admin
    .from("invitations")
    .select("*, organizations(name)")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!invitation) {
    return Response.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.status !== "pending") {
    return Response.json(
      { error: "Solo se pueden reenviar invitaciones pendientes" },
      { status: 409 }
    );
  }

  if (isBrandAdmin) {
    if (invitation.member_type !== "brand_advisor") {
      return Response.json(
        { error: "No autorizado para esta invitación" },
        { status: 403 }
      );
    }
    const [assignedBrandIds, invitationAssignments] = await Promise.all([
      getAgentBrandIds(agent),
      admin
        .from("invitation_brand_assignments")
        .select("brand_id")
        .eq("invitation_id", invitation.id),
    ]);
    const invitationBrandIds = (invitationAssignments.data || []).map(
      (assignment) => assignment.brand_id as string
    );
    if (
      !assignedBrandIds ||
      !invitationBrandIds.some((brandId) => assignedBrandIds.includes(brandId))
    ) {
      return Response.json(
        { error: "No autorizado para esta invitación" },
        { status: 403 }
      );
    }
  }

  // Extend the expiry so the resent link is valid for a full week again.
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await admin
    .from("invitations")
    .update({ expires_at: expiresAt.toISOString() })
    .eq("id", id);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
  const inviteUrl = `${appUrl.replace(/\/$/, "")}/invite/${invitation.id}`;
  const orgName =
    (invitation.organizations as unknown as { name: string } | null)?.name ||
    "Community Manager";

  const emailResult = await sendInvitationEmail({
    to: invitation.email,
    orgName,
    inviteUrl,
    expiresAt,
  });

  if (!emailResult.ok) {
    console.error("[invitations] resend email failed:", emailResult.error);
    return Response.json(
      { error: `No se pudo enviar el correo: ${emailResult.error}` },
      { status: 502 }
    );
  }

  return Response.json({ success: true, email_sent: true });
}
