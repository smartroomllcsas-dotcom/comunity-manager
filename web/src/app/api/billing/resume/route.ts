/**
 * POST /api/billing/resume — "Mantener suscripción".
 *
 * Revierte una baja programada mientras la suscripción sigue vigente. No
 * reactiva suscripciones `suspended` ni `cancelled`: eso exige un pago
 * aprobado y lo resuelve el RPC de activación.
 */
import {
  CANCELLABLE_STATUSES,
  actionErrorResponse,
  loadSubscriptionActionContext,
  revertScheduledCancellation,
} from "@/lib/billing/subscription-actions";

export async function POST() {
  try {
    const context = await loadSubscriptionActionContext({
      statuses: CANCELLABLE_STATUSES,
    });
    if (!context.ok) return actionErrorResponse(context);

    const result = await revertScheduledCancellation(context.value);
    if (!result.ok) return actionErrorResponse(result);

    return Response.json({
      ok: true,
      ...result.value,
    });
  } catch (error) {
    console.error("[billing] resume request failed", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
