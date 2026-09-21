/**
 * Pausar o reactivar una campaña.
 *
 * Es la única escritura sobre la pauta que hace la plataforma, así que lleva
 * tres candados, en este orden:
 *
 *   1. Acceso a la empresa (`getCmClientAccess`).
 *   2. Quien lo pide NO puede ser un miembro acotado a una marca: un asesor
 *      atiende chats, no decide en qué se gasta el presupuesto.
 *   3. La campaña tiene que pertenecer a la cuenta publicitaria de ESA marca.
 *      El token ve decenas de cuentas del portfolio; sin esta comprobación,
 *      cambiando el id en la petición se podría pausar la pauta de otro cliente.
 *
 * Cada cambio queda registrado en `cm_activity_log` con quién y qué.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBrandScopedMember } from "@/lib/smarttalk/brand-scope";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { resolveAdsSource } from "@/lib/meta/ads-source";
import { updateAdObjectStatus, getAdCampaignDetails } from "@/lib/meta";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  status: z.enum(["ACTIVE", "PAUSED"]),
});

/** ¿Este usuario puede mover presupuesto, o sólo mirar? */
async function puedeOperarPauta(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: agent } = await createAdminClient("smarttalk")
    .from("agents")
    .select("id, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (agent && !agent.is_super_admin && isBrandScopedMember(agent)) {
    return {
      ok: false,
      error: "Tu usuario puede ver la pauta pero no pausarla. Pídeselo a un administrador.",
    };
  }
  return { ok: true, userId: (agent?.id as string) || user.id };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await context.params;
  if (!/^\d+$/.test(campaignId)) {
    return NextResponse.json({ error: "campaignId inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  const { clientId, status } = parsed.data;

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const permiso = await puedeOperarPauta();
  if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: 403 });

  const source = await resolveAdsSource(access.clientId);
  if (!source.ok) {
    return NextResponse.json({ error: source.reason, needsConnect: source.needsConnect }, { status: 409 });
  }

  try {
    // Se relee la campaña para comprobar de quién es y con qué nombre queda
    // registrada. Es una llamada más, y vale la pena: es lo que impide tocar
    // la pauta de otro cliente.
    const detail = await getAdCampaignDetails(campaignId, source.token, { preset: "today" });
    const campaign = (detail.campaign || {}) as Record<string, unknown>;
    const cuentaCampana = String(campaign.account_id || "").replace(/^act_/, "");
    if (!cuentaCampana || cuentaCampana !== source.adAccountId.replace(/^act_/, "")) {
      return NextResponse.json({ error: "La campaña no pertenece a esta marca" }, { status: 404 });
    }

    await updateAdObjectStatus(campaignId, source.token, status);

    // Meta acepta ACTIVE aunque no vaya a correr (cuenta sin método de pago,
    // conjunto padre en pausa). El estado que manda es el efectivo.
    const despues = await getAdCampaignDetails(campaignId, source.token, { preset: "today" });
    const nuevo = (despues.campaign || {}) as Record<string, unknown>;
    const efectivo = String(nuevo.effective_status || nuevo.status || status);

    const nombre = String(campaign.name || campaignId);
    await createAdminClient("public")
      .from("cm_activity_log")
      .insert({
        user_id: access.cmUserId,
        action: `${status === "PAUSED" ? "Pausó" : "Reactivó"} la campaña «${nombre}» (act_${cuentaCampana})`,
        status: "success",
      });

    return NextResponse.json({
      ok: true,
      status: efectivo,
      aviso:
        status === "ACTIVE" && efectivo !== "ACTIVE"
          ? `Meta aceptó el cambio pero la campaña sigue en «${efectivo}». Suele ser la cuenta sin método de pago o el conjunto de anuncios en pausa.`
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta no aceptó el cambio" },
      { status: 502 }
    );
  }
}
