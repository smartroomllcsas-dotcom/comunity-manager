/**
 * POST /api/cm/clients/[id]/lifecycle — desactivar o reactivar una marca.
 *
 * Body: { "action": "deactivate" } | { "action": "reactivate" }
 *
 * Quién puede
 * -----------
 *   * super admin
 *   * admin de la agencia (`role = 'admin'` y `member_type = 'agency_user'`)
 *
 * `brand_admin` y `brand_advisor` reciben 403 aunque la marca sea suya: quién
 * administra el catálogo de marcas —y por tanto el consumo del plan— es la
 * agencia, no quien opera una marca concreta.
 *
 * Una marca de otra organización responde **404**, no 403. Un 403 confirmaría
 * que ese identificador existe; el 404 no distingue entre «no existe» y «no es
 * tuya». El filtro por organización viaja dentro de la propia consulta.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BrandLifecycleError,
  deactivateBrand,
  getBrandInOrg,
  reactivateBrand,
} from "@/lib/smarttalk/brand-lifecycle";
import { BRAND_INACTIVE_LABEL } from "@/lib/smarttalk/brand-status";

const ACTIONS = new Set(["deactivate", "reactivate"]);

function canManageBrandLifecycle(agent: {
  role?: string | null;
  member_type?: string | null;
  is_super_admin?: boolean | null;
}) {
  return (
    agent.is_super_admin === true ||
    (agent.role === "admin" && agent.member_type === "agency_user")
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action debe ser 'deactivate' o 'reactivate'." },
      { status: 400 },
    );
  }

  const admin = createAdminClient("smarttalk");
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id, role, member_type, is_super_admin, email")
    .eq("id", user.id)
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado." }, { status: 404 });
  }

  if (!canManageBrandLifecycle(agent)) {
    return NextResponse.json(
      { error: "Solo un administrador de la agencia puede activar o desactivar marcas." },
      { status: 403 },
    );
  }

  try {
    const brand = await getBrandInOrg(id, agent.organization_id);
    // Inexistente y ajena responden igual, a propósito.
    if (!brand) {
      return NextResponse.json({ error: "Marca no encontrada." }, { status: 404 });
    }

    const actor = { agentId: agent.id, email: agent.email as string | null };
    const result =
      action === "deactivate"
        ? await deactivateBrand({ brand, organizationId: agent.organization_id, actor })
        : await reactivateBrand({ brand, organizationId: agent.organization_id, actor });

    return NextResponse.json({
      ok: true,
      action,
      brand: {
        id: result.brandId,
        status: result.brandStatus,
        label: result.brandStatus === "paused" ? BRAND_INACTIVE_LABEL : null,
      },
      // false = la marca ya estaba así. Se responde 200 igualmente: la llamada
      // es idempotente y el estado final es el pedido.
      changed: result.changed,
      channels: result.channels,
      needsReconnection: result.needsReconnection,
    });
  } catch (error) {
    if (error instanceof BrandLifecycleError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
