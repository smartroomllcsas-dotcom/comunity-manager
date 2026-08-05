import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";

function canDeleteContacts(agent: {
  role?: string | null;
  member_type?: string | null;
  is_super_admin?: boolean | null;
}) {
  return (
    agent.is_super_admin === true ||
    (agent.role === "admin" && agent.member_type === "agency_user") ||
    agent.member_type === "brand_admin"
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient("smarttalk");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id, role, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (!canDeleteContacts(agent)) {
    return NextResponse.json(
      { error: "Solo los administradores pueden eliminar contactos" },
      { status: 403 },
    );
  }

  const { data: contact, error: contactError } = await admin
    .from("contacts")
    .select("id, brand_id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .maybeSingle();
  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const assignedBrandIds = agent.is_super_admin ? null : await getAgentBrandIds(agent);
  if (assignedBrandIds && !assignedBrandIds.includes(contact.brand_id)) {
    return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });
  }

  const { error: deleteError } = await admin
    .from("contacts")
    .delete()
    .eq("id", contact.id)
    .eq("organization_id", agent.organization_id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ success: true, deletedContactId: contact.id });
}
