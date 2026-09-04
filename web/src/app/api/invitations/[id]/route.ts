import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";

export async function DELETE(
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

  const isAgencyAdmin =
    agent.is_super_admin === true ||
    (agent.role === "admin" && agent.member_type === "agency_user");
  const isBrandAdmin = agent.member_type === "brand_admin";
  if (!isAgencyAdmin && !isBrandAdmin) {
    return Response.json({ error: "Only admins can cancel invitations" }, { status: 403 });
  }

  // Verify the invitation belongs to the same org
  const { data: invitation } = await admin
    .from("invitations")
    .select("*")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!invitation) {
    return Response.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (isBrandAdmin) {
    if (invitation.member_type !== "brand_advisor") {
      return Response.json({ error: "No autorizado para esta invitación" }, { status: 403 });
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
      return Response.json({ error: "No autorizado para esta invitación" }, { status: 403 });
    }
  }

  // Sólo se pueden cancelar invitaciones que siguen pendientes.
  if (invitation.status !== "pending") {
    return Response.json(
      { error: "La invitación ya fue aceptada o venció; no se puede cancelar." },
      { status: 409 }
    );
  }

  // Se elimina la fila (las asignaciones de marca caen en cascada). Antes se
  // intentaba poner status="cancelled", valor que el enum invitation_status
  // no admite: la cancelación fallaba siempre y la UI no avisaba.
  const { error } = await admin.from("invitations").delete().eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
