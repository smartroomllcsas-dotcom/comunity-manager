import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSubscriptionEvent } from "@/lib/billing/subscription-actions";

/**
 * Transiciones que un super admin puede ejecutar a mano.
 *
 * `active` y `trial` NO son destinos válidos: reactivar exige un pago aprobado
 * procesado por `finalize_epayco_approved_payment`, que además fija el nuevo
 * período. Permitir el salto directo dejaba la suscripción `active` con un
 * `current_period_end` en el pasado, y el cron la devolvía a `past_due` en la
 * siguiente corrida.
 */
const ALLOWED_ADMIN_TRANSITIONS: Record<string, readonly string[]> = {
  trial: ["cancelled", "suspended"],
  active: ["past_due", "cancelled", "suspended"],
  past_due: ["suspended", "cancelled"],
  suspended: ["cancelled"],
  cancelled: [],
};

const PAYMENT_ONLY_STATUSES = new Set(["active", "trial"]);

async function verifySuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: agent } = await supabase.from("agents").select("is_super_admin").eq("id", user.id).single();
  return agent?.is_super_admin === true ? user.id : null;
}

export async function GET() {
  if (!(await verifySuperAdmin())) return Response.json({ error: "No autorizado" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("*, organization:organizations(name), plan:plans!subscriptions_plan_id_fkey(name)")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function PATCH(request: Request) {
  const actorId = await verifySuperAdmin();
  if (!actorId) return Response.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const reason = typeof body?.reason === "string" && body.reason ? body.reason : "admin_manual_change";

  if (!id || !Object.keys(ALLOWED_ADMIN_TRANSITIONS).includes(status)) {
    return Response.json({ error: "Suscripción o estado inválido" }, { status: 400 });
  }

  if (PAYMENT_ONLY_STATUSES.has(status)) {
    return Response.json(
      {
        error:
          "Una suscripción solo puede activarse con un pago aprobado. Usa el checkout de reactivación.",
        code: "REACTIVATION_REQUIRES_PAYMENT",
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, organization_id, status, current_period_end, cancel_at_period_end")
    .eq("id", id)
    .maybeSingle();

  if (!subscription) {
    return Response.json({ error: "Suscripción no encontrada" }, { status: 404 });
  }

  const current = String(subscription.status);
  if (current === status) {
    // Idempotente: repetir la misma transición no duplica el evento.
    return Response.json({ ok: true, unchanged: true, status });
  }

  const allowed = ALLOWED_ADMIN_TRANSITIONS[current] || [];
  if (!allowed.includes(status)) {
    return Response.json(
      {
        error: `Transición inválida: ${current} -> ${status}`,
        code: "INVALID_TRANSITION",
        allowed,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, status_reason: reason };
  if (status === "cancelled") {
    patch.cancelled_at = now;
    patch.grace_ends_at = null;
  }
  if (status === "suspended") patch.suspended_at = now;

  const { data: updated, error } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("id", id)
    .eq("status", current)
    .select("id");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (Array.isArray(updated) && updated.length === 0) {
    return Response.json(
      { error: "La suscripción cambió durante la operación", code: "CONCURRENT_MODIFICATION" },
      { status: 409 },
    );
  }

  await recordSubscriptionEvent({
    subscription: {
      id: String(subscription.id),
      organization_id: String(subscription.organization_id),
      status: current,
      current_period_end: (subscription.current_period_end as string | null) ?? null,
      cancel_at_period_end: (subscription.cancel_at_period_end as boolean | null) ?? null,
    },
    organizationId: String(subscription.organization_id),
    reason,
    actorType: "admin",
    actorId,
    newStatus: status,
    correlationId: `admin:${id}:${now}`,
    metadata: { previous_status: current, requested_status: status },
  });

  return Response.json({ ok: true, status });
}
