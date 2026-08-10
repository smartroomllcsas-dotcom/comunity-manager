/**
 * POST /api/billing/cancel — "Cancelar al final del período".
 *
 * No cambia `status` ni revoca acceso: marca `cancel_at_period_end=true` y el
 * cliente conserva su plan hasta `current_period_end`. El paso efectivo a
 * `cancelled` lo hace `/api/cron/billing-lifecycle`.
 */
import { billingError } from "@/lib/billing/log";
import {
  CANCELLABLE_STATUSES,
  actionErrorResponse,
  loadSubscriptionActionContext,
  scheduleCancellation,
} from "@/lib/billing/subscription-actions";

export async function POST() {
  // Se concreta en cuanto se conoce la suscripción. Antes de eso el fallo no
  // pertenece a ninguna: decirlo es más útil que inventar un identificador.
  let correlationId = "cancel:sin-contexto";
  let organizationId: string | null = null;

  try {
    const context = await loadSubscriptionActionContext({
      statuses: CANCELLABLE_STATUSES,
    });
    if (!context.ok) return actionErrorResponse(context);

    correlationId = `cancel:${context.value.subscription.id}`;
    organizationId = context.value.organizationId;

    const result = await scheduleCancellation(context.value);
    if (!result.ok) return actionErrorResponse(result);

    return Response.json({
      ok: true,
      ...result.value,
    });
  } catch (error) {
    billingError("cancel_request_failed", {
      correlationId,
      organizationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
