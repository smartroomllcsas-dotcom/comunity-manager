/**
 * POST /api/billing/resume — "Mantener suscripción".
 *
 * Revierte una baja programada mientras la suscripción sigue vigente. No
 * reactiva suscripciones `suspended` ni `cancelled`: eso exige un pago
 * aprobado y lo resuelve el RPC de activación.
 */
import { billingError } from "@/lib/billing/log";
import {
  CANCELLABLE_STATUSES,
  actionErrorResponse,
  loadSubscriptionActionContext,
  revertScheduledCancellation,
} from "@/lib/billing/subscription-actions";

export async function POST() {
  // Mismo criterio que en /cancel: el identificador es el real de la
  // suscripción en cuanto se conoce.
  let correlationId = "resume:sin-contexto";
  let organizationId: string | null = null;

  try {
    const context = await loadSubscriptionActionContext({
      statuses: CANCELLABLE_STATUSES,
    });
    if (!context.ok) return actionErrorResponse(context);

    correlationId = `resume:${context.value.subscription.id}`;
    organizationId = context.value.organizationId;

    const result = await revertScheduledCancellation(context.value);
    if (!result.ok) return actionErrorResponse(result);

    return Response.json({
      ok: true,
      ...result.value,
    });
  } catch (error) {
    billingError("resume_request_failed", {
      correlationId,
      organizationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
