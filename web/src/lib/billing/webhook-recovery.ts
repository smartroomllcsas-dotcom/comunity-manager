/**
 * Recuperación de `billing_webhook_events` en estado `failed`.
 *
 * Implementa las decisiones de negocio D-1 y D-2:
 *
 *  D-1 · Sólo se reprocesa un evento con `signature_valid = true`. Una firma
 *        inválida NO se reprocesa jamás. Cada intento de recuperación trata de
 *        dejar registro en `smarttalk.billing_audit_events`; ver
 *        "Política de auditoría" más abajo para qué ocurre si esa escritura
 *        falla.
 *
 *  D-2 · Ante `amount_or_currency_mismatch`, `environment_mismatch` o
 *        `existing_payment_mismatch` se notifica al administrador y se crea una
 *        alerta de revisión. **La cuenta NO se bloquea automáticamente.**
 *
 * ## Concurrencia
 *
 * Cada evento se reclama con un lease optimista (`locked_at` + `locked_by`)
 * antes de tocarlo: un `UPDATE` condicional que sólo tiene éxito si el evento
 * está libre o su lease caducó. Dos crons simultáneos no pueden procesar el
 * mismo evento, y un worker que muera dejando el lease puesto no bloquea la
 * fila más allá de `LEASE_SECONDS`.
 *
 * ## Política de auditoría
 *
 * La auditoría es **best-effort y NO bloquea la recuperación**: el efecto sobre
 * el cobro ya ocurrió cuando se escribe, así que abortar dejaría el sistema en
 * un estado peor. Un fallo de auditoría se registra en el log de error y se
 * cuenta en `auditFailures`, que el cron devuelve en su respuesta para que sea
 * visible y conciliable. Por tanto **no puede afirmarse que toda recuperación
 * quede auditada**: lo garantizado es que todo fallo de auditoría es contado y
 * visible.
 *
 * ## Requisito de esquema
 *
 * Necesita la columna `locked_by`, que añade la migración
 * `20260810000200_034_webhook_recovery_lease.sql`. **Si no está aplicada, el
 * worker se detiene con `schema_not_ready` en lugar de procesar sin lease.**
 */
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleEpaycoConfirmation } from "@/lib/billing/epayco-activation";
import { enqueueBillingNotification } from "@/lib/billing/notifications";
import { outboxRetryDelaySeconds } from "@/lib/billing/outbox";
import { billingError } from "@/lib/billing/log";

/** Fallos de infraestructura u orden de llegada: reintentar es seguro. */
export const RECOVERABLE_ERRORS = [
  "atomic_activation_failed",
  "payment_insert_failed",
  "checkout_session_not_found",
] as const;

/** Conflictos de datos que exigen revisión humana (D-2). */
export const REVIEW_REQUIRED_ERRORS = [
  "amount_or_currency_mismatch",
  "environment_mismatch",
  "existing_payment_mismatch",
] as const;

/** Conflictos definitivos: reintentar no cambia el resultado y no se alerta. */
export const PERMANENT_ERRORS = ["reference_mismatch"] as const;

export type WebhookFailureClass = "recoverable" | "review_required" | "permanent" | "unknown";

export const MAX_RECOVERY_ATTEMPTS = 5;
/** Duración del lease. Pasado este tiempo otro worker puede reclamar el evento. */
export const LEASE_SECONDS = 120;

export class WebhookRecoverySchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookRecoverySchemaError";
  }
}

export function classifyWebhookFailure(lastError: string | null | undefined): WebhookFailureClass {
  if (!lastError) return "unknown";
  if ((RECOVERABLE_ERRORS as readonly string[]).includes(lastError)) return "recoverable";
  if ((REVIEW_REQUIRED_ERRORS as readonly string[]).includes(lastError)) return "review_required";
  if ((PERMANENT_ERRORS as readonly string[]).includes(lastError)) return "permanent";
  // Un motivo nuevo no se reprocesa a ciegas: se trata como revisión humana.
  return "unknown";
}

interface FailedWebhookRow {
  id: string;
  provider: string;
  environment: string;
  event_key: string;
  signature_valid: boolean;
  status: string;
  last_error: string | null;
  attempt_count: number | null;
  next_attempt_at: string | null;
  locked_at: string | null;
  payload: Record<string, string> | null;
}

export interface RecoveryOutcome {
  /** Identificador de esta ejecución; el mismo que queda en `locked_by`. */
  workerId: string;
  scanned: number;
  claimed: number;
  recovered: number;
  retried: number;
  deadLettered: number;
  flaggedForReview: number;
  skippedNotDue: number;
  skippedLocked: number;
  /** Escrituras de estado que la base rechazó. Un valor > 0 exige revisión. */
  writeFailures: number;
  /** Auditorías que no se pudieron escribir. Un valor > 0 exige conciliación. */
  auditFailures: number;
}

function emptyOutcome(workerId: string): RecoveryOutcome {
  return {
    workerId,
    scanned: 0,
    claimed: 0,
    recovered: 0,
    retried: 0,
    deadLettered: 0,
    flaggedForReview: 0,
    skippedNotDue: 0,
    skippedLocked: 0,
    writeFailures: 0,
    auditFailures: 0,
  };
}

/** Detecta que falta la columna `locked_by` (migración 034 sin aplicar). */
function isMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42703" || /locked_by/.test(error.message || "");
}

/**
 * Registra la recuperación en la bitácora de auditoría.
 *
 * Devuelve `false` si la escritura falló. El llamador NO aborta por ello (ver
 * "Política de auditoría"), pero sí lo contabiliza.
 */
async function audit(input: {
  organizationId: string | null;
  eventId: string;
  action: string;
  result: "success" | "denied" | "failed";
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_audit_events").insert({
    organization_id: input.organizationId,
    actor_type: "system",
    action: input.action,
    entity_type: "billing_webhook_event",
    entity_id: input.eventId,
    correlation_id: randomUUID(),
    before_data: input.before,
    after_data: input.after,
    result: input.result,
  });
  if (error) {
    billingError("audit_write_lost", {
      correlationId: `webhook-recovery:${input.eventId}`,
      organizationId: input.organizationId,
      code: error.code,
      message: error.message,
      action: input.action,
    });
    return false;
  }
  return true;
}

/**
 * Escribe el estado del evento y **reporta** si la base rechazó la escritura.
 *
 * Antes esta función ignoraba el error, de modo que un evento podía quedar en
 * `failed` mientras el worker lo contaba como recuperado.
 */
async function markEvent(eventId: string, patch: Record<string, unknown>) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("billing_webhook_events")
    .update(patch)
    .eq("id", eventId)
    .select("id");
  if (error) {
    billingError("webhook_event_update_failed", {
      correlationId: `webhook-recovery:${eventId}`,
      code: error.code,
      message: error.message,
      patch: Object.keys(patch),
    });
    return false;
  }
  return true;
}

/** Libera el lease sin tocar el resto del estado. */
async function releaseLease(eventId: string) {
  return markEvent(eventId, { locked_at: null, locked_by: null });
}

/**
 * Reclama el evento con un lease optimista.
 *
 * El `UPDATE` condicional es atómico en PostgreSQL: si dos workers lo intentan
 * a la vez, sólo uno ve filas afectadas.
 */
async function claimEvent(eventId: string, workerId: string) {
  const admin = createAdminClient();
  const leaseCutoff = new Date(Date.now() - LEASE_SECONDS * 1000).toISOString();
  const { data, error } = await admin
    .from("billing_webhook_events")
    .update({ locked_at: new Date().toISOString(), locked_by: workerId })
    .eq("id", eventId)
    .eq("status", "failed")
    .or(`locked_at.is.null,locked_at.lt.${leaseCutoff}`)
    .select("id");

  if (isMissingColumn(error)) {
    throw new WebhookRecoverySchemaError(
      "falta la columna locked_by: aplica la migración 034 antes de habilitar el worker",
    );
  }
  if (error) {
    billingError("webhook_claim_failed", {
      correlationId: `webhook-recovery:${eventId}`,
      code: error.code,
    });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function resolveOrganizationId(payload: Record<string, string> | null) {
  const checkoutSessionId = payload?.x_extra1;
  if (!checkoutSessionId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("checkout_sessions")
    .select("organization_id")
    .eq("id", checkoutSessionId)
    .maybeSingle();
  return (data?.organization_id as string | undefined) || null;
}

/**
 * Recorre los eventos fallidos elegibles y los reprocesa o escala.
 *
 * Selección: `status='failed'` **y** `signature_valid=true` **y**
 * `attempt_count < MAX_RECOVERY_ATTEMPTS` **y** (`next_attempt_at` nulo o
 * vencido). Cada evento se reclama antes de tocarse.
 */
export async function recoverFailedWebhookEvents(limit = 25): Promise<RecoveryOutcome> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const workerId = `vercel-webhook-recovery-${randomUUID()}`;
  const outcome = emptyOutcome(workerId);

  const { data, error } = await admin
    .from("billing_webhook_events")
    .select(
      "id, provider, environment, event_key, signature_valid, status, last_error, attempt_count, next_attempt_at, locked_at, payload",
    )
    .eq("status", "failed")
    // D-1: la firma inválida queda fuera de la selección, no sólo del bucle.
    .eq("signature_valid", true)
    .lt("attempt_count", MAX_RECOVERY_ATTEMPTS)
    // Un evento recién fallido no trae `next_attempt_at`: es elegible ya.
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    // La tabla NO tiene `created_at`: su columna de llegada es `received_at`
    // (migración 009). Usar la equivocada hacía fallar la consulta entera.
    .order("received_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`billing webhook recovery scan failed: ${error.message}`);
  }

  const events = (data || []) as FailedWebhookRow[];
  outcome.scanned = events.length;

  for (const event of events) {
    // Defensa en profundidad frente a un filtro mal editado en el futuro.
    if (event.signature_valid !== true) continue;
    if (event.next_attempt_at && new Date(event.next_attempt_at).getTime() > Date.now()) {
      outcome.skippedNotDue += 1;
      continue;
    }
    if (Number(event.attempt_count || 0) >= MAX_RECOVERY_ATTEMPTS) continue;

    const claimed = await claimEvent(event.id, workerId);
    if (!claimed) {
      // Otro worker lo tiene con lease vigente.
      outcome.skippedLocked += 1;
      continue;
    }
    outcome.claimed += 1;

    const classification = classifyWebhookFailure(event.last_error);
    const organizationId = await resolveOrganizationId(event.payload);
    const before = {
      status: event.status,
      last_error: event.last_error,
      attempt_count: event.attempt_count,
    };

    try {
      if (classification === "review_required" || classification === "unknown") {
        // D-2: alertar y dejar para revisión humana. La cuenta NO se bloquea.
        const written = await markEvent(event.id, {
          status: "dead_letter",
          last_error_code: "review_required",
          processed_at: nowIso,
          locked_at: null,
          locked_by: null,
        });
        if (!written) {
          outcome.writeFailures += 1;
          continue;
        }
        if (organizationId) {
          await enqueueBillingNotification({
            organizationId,
            subscriptionId: null,
            webhookEventId: event.id,
            idempotencyKey: `webhook-review:${event.id}`,
            subject: "Revisión manual requerida en un pago",
            text:
              `Una confirmación de pago quedó marcada para revisión (${event.last_error}). ` +
              `Evento ${event.event_key} en ${event.environment}. ` +
              "La cuenta sigue activa; ningún acceso fue bloqueado automáticamente.",
            metadata: { last_error: event.last_error, event_key: event.event_key },
          });
        }
        if (
          !(await audit({
            organizationId,
            eventId: event.id,
            action: "webhook_recovery_review_required",
            result: "denied",
            before,
            after: { status: "dead_letter", classification },
          }))
        ) {
          outcome.auditFailures += 1;
        }
        outcome.flaggedForReview += 1;
        continue;
      }

      if (classification === "permanent") {
        const written = await markEvent(event.id, {
          status: "dead_letter",
          last_error_code: "permanent_failure",
          processed_at: nowIso,
          locked_at: null,
          locked_by: null,
        });
        if (!written) {
          outcome.writeFailures += 1;
          continue;
        }
        if (
          !(await audit({
            organizationId,
            eventId: event.id,
            action: "webhook_recovery_permanent_failure",
            result: "failed",
            before,
            after: { status: "dead_letter", classification },
          }))
        ) {
          outcome.auditFailures += 1;
        }
        outcome.deadLettered += 1;
        continue;
      }

      // recoverable
      if (!event.payload || !event.payload.x_transaction_id) {
        const written = await markEvent(event.id, {
          status: "dead_letter",
          last_error_code: "payload_incomplete",
          processed_at: nowIso,
          locked_at: null,
          locked_by: null,
        });
        if (!written) {
          outcome.writeFailures += 1;
          continue;
        }
        if (
          !(await audit({
            organizationId,
            eventId: event.id,
            action: "webhook_recovery_payload_incomplete",
            result: "failed",
            before,
            after: { status: "dead_letter" },
          }))
        ) {
          outcome.auditFailures += 1;
        }
        outcome.deadLettered += 1;
        continue;
      }

      let settlement;
      try {
        settlement = await settleEpaycoConfirmation(event.payload);
      } catch (settleError) {
        billingError("settlement_threw_during_recovery", {
          correlationId: `webhook-recovery:${event.id}`,
          organizationId,
          message: settleError instanceof Error ? settleError.message : String(settleError),
        });
        settlement = { outcome: "failed" as const, reason: "atomic_activation_failed" as const };
      }

      if (
        settlement.outcome === "activated" ||
        settlement.outcome === "recorded" ||
        settlement.outcome === "ignored"
      ) {
        const written = await markEvent(event.id, {
          status: "processed",
          last_error: null,
          last_error_code: null,
          processed_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
        });
        if (!written) {
          outcome.writeFailures += 1;
          continue;
        }
        if (
          !(await audit({
            organizationId,
            eventId: event.id,
            action: "webhook_recovery_processed",
            result: "success",
            before,
            after: { status: "processed", settlement: settlement.outcome },
          }))
        ) {
          outcome.auditFailures += 1;
        }
        outcome.recovered += 1;
        continue;
      }

      // Fallo reprocesable: se incrementa el intento y se agenda el siguiente.
      const nextAttempt = Number(event.attempt_count || 0) + 1;
      const exhausted = nextAttempt >= MAX_RECOVERY_ATTEMPTS;

      const patch: Record<string, unknown> = {
        attempt_count: nextAttempt,
        last_error: settlement.reason,
        locked_at: null,
        locked_by: null,
      };
      if (exhausted) {
        // Se agota aquí, no en una pasada futura: con `attempt_count < MAX` en
        // la consulta, un evento en el máximo ya no volvería a seleccionarse.
        patch.status = "dead_letter";
        patch.last_error_code = "max_attempts_reached";
        patch.processed_at = new Date().toISOString();
      } else {
        patch.next_attempt_at = new Date(
          Date.now() + outboxRetryDelaySeconds(nextAttempt) * 1000,
        ).toISOString();
      }

      const written = await markEvent(event.id, patch);
      if (!written) {
        outcome.writeFailures += 1;
        continue;
      }

      if (exhausted && organizationId) {
        await enqueueBillingNotification({
          organizationId,
          webhookEventId: event.id,
          idempotencyKey: `webhook-dead-letter:${event.id}`,
          subject: "Un pago no pudo procesarse tras varios intentos",
          text:
            `La confirmación ${event.event_key} agotó ${MAX_RECOVERY_ATTEMPTS} intentos ` +
            `(${settlement.reason}) y requiere revisión manual. La cuenta no fue bloqueada.`,
          metadata: { last_error: settlement.reason, attempts: nextAttempt },
        });
      }

      if (
        !(await audit({
          organizationId,
          eventId: event.id,
          action: exhausted ? "webhook_recovery_exhausted" : "webhook_recovery_retry",
          result: "failed",
          before,
          after: { attempt_count: nextAttempt, last_error: settlement.reason, exhausted },
        }))
      ) {
        outcome.auditFailures += 1;
      }

      if (exhausted) outcome.deadLettered += 1;
      else outcome.retried += 1;
    } catch (unexpected) {
      // Nunca dejar un lease colgado por un error no previsto.
      billingError("webhook_recovery_unexpected_error", {
        correlationId: `webhook-recovery:${event.id}`,
        message: unexpected instanceof Error ? unexpected.message : String(unexpected),
      });
      await releaseLease(event.id);
      outcome.writeFailures += 1;
    }
  }

  return outcome;
}
