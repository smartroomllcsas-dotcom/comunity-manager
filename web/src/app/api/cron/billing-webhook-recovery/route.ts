/**
 * GET /api/cron/billing-webhook-recovery
 *
 * Recupera confirmaciones de pago que quedaron en `failed` por causas
 * transitorias, siguiendo las decisiones D-1 y D-2. Protegido con `CRON_SECRET`
 * igual que el resto de crons de billing.
 *
 * ATENCIÓN para el despliegue: la entrada correspondiente en `vercel.json` se
 * añadió en este mismo cambio. Al desplegar, el cron empieza a ejecutarse.
 */
import { NextRequest } from "next/server";
import {
  WebhookRecoverySchemaError,
  recoverFailedWebhookEvents,
} from "@/lib/billing/webhook-recovery";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const outcome = await recoverFailedWebhookEvents(25);
    // `writeFailures` y `auditFailures` viajan en la respuesta a propósito: son
    // la señal de que algo quedó sin registrar y necesita conciliación manual.
    return Response.json({ ok: true, ...outcome, processedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof WebhookRecoverySchemaError) {
      // La migración 034 no está aplicada: mejor no procesar que hacerlo sin lease.
      console.error("[billing] webhook recovery deshabilitado", { message: error.message });
      return Response.json(
        { error: error.message, code: "SCHEMA_NOT_READY" },
        { status: 503 },
      );
    }
    console.error("[billing] webhook recovery failed", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
