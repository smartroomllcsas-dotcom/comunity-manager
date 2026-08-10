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
import { billingError, billingLog } from "@/lib/billing/log";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const outcome = await recoverFailedWebhookEvents(25);
    const processedAt = new Date().toISOString();

    // Log estructurado en una sola línea: los logs de Vercel se consultan por
    // texto, así que un objeto JSON plano permite filtrar y graficar sin abrir
    // cada invocación. Se emite SIEMPRE, también cuando no hubo trabajo.
    const summary = {
      scanned: outcome.scanned,
      claimed: outcome.claimed,
      recovered: outcome.recovered,
      retried: outcome.retried,
      deadLettered: outcome.deadLettered,
      flaggedForReview: outcome.flaggedForReview,
      skippedNotDue: outcome.skippedNotDue,
      skippedLocked: outcome.skippedLocked,
      writeFailures: outcome.writeFailures,
      auditFailures: outcome.auditFailures,
      durationMs: Date.now() - startedAt,
      processedAt,
    };

    // Un fallo de escritura o de auditoría deja algo sin registrar: se emite
    // como error para que salte en los filtros por nivel, no sólo en el texto.
    billingLog(
      outcome.writeFailures > 0 || outcome.auditFailures > 0 ? "error" : "info",
      "webhook_recovery_summary",
      // El workerId es el identificador real de esta ejecución: el mismo que
      // quedó en `locked_by` de cada evento reclamado.
      { correlationId: outcome.workerId, ...summary },
    );

    // `writeFailures` y `auditFailures` viajan también en la respuesta: son la
    // señal de que algo quedó sin registrar y necesita conciliación manual.
    return Response.json({ ok: true, ...outcome, processedAt });
  } catch (error) {
    if (error instanceof WebhookRecoverySchemaError) {
      // La migración 034 no está aplicada: mejor no procesar que hacerlo sin lease.
      billingError("webhook_recovery_schema_not_ready", {
        correlationId: "webhook-recovery:schema",
        message: error.message,
      });
      return Response.json(
        { error: error.message, code: "SCHEMA_NOT_READY" },
        { status: 503 },
      );
    }
    billingError("webhook_recovery_failed", {
      correlationId: "webhook-recovery:batch",
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
