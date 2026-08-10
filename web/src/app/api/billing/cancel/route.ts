/**
 * POST /api/billing/cancel — "Cancelar al final del período".
 *
 * No cambia `status` ni revoca acceso: marca `cancel_at_period_end=true` y el
 * cliente conserva su plan hasta `current_period_end`. El paso efectivo a
 * `cancelled` lo hace `/api/cron/billing-lifecycle`.
 */
import {
  CANCELLABLE_STATUSES,
  actionErrorResponse,
  loadSubscriptionActionContext,
  scheduleCancellation,
} from "@/lib/billing/subscription-actions";

export async function POST() {
  try {
    const context = await loadSubscriptionActionContext({
      statuses: CANCELLABLE_STATUSES,
    });
    if (!context.ok) return actionErrorResponse(context);

    const result = await scheduleCancellation(context.value);
    if (!result.ok) return actionErrorResponse(result);

    return Response.json({
      ok: true,
      ...result.value,
    });
  } catch (error) {
    console.error("[billing] cancel request failed", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
