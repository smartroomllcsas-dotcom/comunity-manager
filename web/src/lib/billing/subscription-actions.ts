/**
 * Acciones de ciclo de vida de suscripción iniciadas por el cliente.
 *
 * Reglas que este módulo garantiza y que las rutas no deben duplicar:
 *
 *  1. Solo un administrador de la organización dueña de la suscripción puede
 *     actuar sobre ella. La organización se resuelve desde `agents`, nunca
 *     desde el cuerpo de la petición.
 *  2. Cancelar NO cambia `status`: marca `cancel_at_period_end=true` y el
 *     acceso continúa hasta `current_period_end`. El cron
 *     (`/api/cron/billing-lifecycle`) es el único que materializa el paso a
 *     `cancelled`.
 *  3. Ninguna acción de cliente puede llevar una suscripción a `active`. La
 *     reactivación exige un pago aprobado y la ejecuta el RPC
 *     `finalize_epayco_approved_payment`.
 *  4. Las escrituras usan guardas optimistas sobre el estado leído, de modo
 *     que dos peticiones simultáneas producen exactamente un evento.
 *  5. Toda transición efectiva registra una fila en `subscription_events`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Estados en los que una suscripción todavía puede programar su baja. */
export const CANCELLABLE_STATUSES = ["trial", "active"] as const;

/** Estados que solo pueden salir de su situación con un pago aprobado. */
export const PAYMENT_REQUIRED_STATUSES = [
  "past_due",
  "suspended",
  "cancelled",
] as const;

export type SubscriptionActionErrorCode =
  | "UNAUTHENTICATED"
  | "AGENT_NOT_FOUND"
  | "FORBIDDEN_ROLE"
  | "SUBSCRIPTION_NOT_FOUND"
  | "SUBSCRIPTION_NOT_CANCELLABLE"
  | "SUBSCRIPTION_PERIOD_ENDED"
  | "NO_SCHEDULED_CANCELLATION"
  | "CONCURRENT_MODIFICATION"
  | "WRITE_FAILED";

export interface SubscriptionActionContext {
  userId: string;
  organizationId: string;
  subscription: SubscriptionRow;
}

export interface SubscriptionRow {
  id: string;
  organization_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  trial_ends_at?: string | null;
  grace_ends_at?: string | null;
}

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: SubscriptionActionErrorCode; status: number; message: string };

function failure(
  code: SubscriptionActionErrorCode,
  status: number,
  message: string,
): { ok: false; code: SubscriptionActionErrorCode; status: number; message: string } {
  return { ok: false, code, status, message };
}

function isFuture(value: string | null | undefined) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

/**
 * Resuelve el usuario autenticado, su organización y la suscripción vigente.
 *
 * La suscripción se busca por `organization_id` del agente: el cliente nunca
 * envía un identificador de suscripción, así que no existe superficie para
 * actuar sobre la suscripción de otra organización.
 */
export async function loadSubscriptionActionContext(options: {
  /** Estados admitidos para la acción; el resto se rechaza antes de escribir. */
  statuses: readonly string[];
}): Promise<ActionResult<SubscriptionActionContext>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return failure("UNAUTHENTICATED", 401, "No autenticado");
  }

  const admin = createAdminClient();
  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!agent?.organization_id) {
    return failure("AGENT_NOT_FOUND", 404, "Agente no encontrado");
  }
  if (agent.role !== "admin") {
    return failure(
      "FORBIDDEN_ROLE",
      403,
      "Solo un administrador puede gestionar la suscripción",
    );
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select(
      "id, organization_id, status, current_period_end, cancel_at_period_end, trial_ends_at, grace_ends_at",
    )
    .eq("organization_id", agent.organization_id)
    .in("status", options.statuses as string[])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) {
    return failure(
      "SUBSCRIPTION_NOT_FOUND",
      404,
      "No encontramos una suscripción vigente para tu organización",
    );
  }

  return {
    ok: true,
    value: {
      userId: user.id,
      organizationId: agent.organization_id as string,
      subscription: subscription as SubscriptionRow,
    },
  };
}

async function recordSubscriptionEvent(input: {
  subscription: SubscriptionRow;
  organizationId: string;
  reason: string;
  actorType: "user" | "admin";
  actorId: string;
  newStatus?: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("subscription_events").insert({
    subscription_id: input.subscription.id,
    organization_id: input.organizationId,
    previous_status: input.subscription.status,
    // Programar o revertir una baja no cambia el estado: la columna es NOT NULL
    // y refleja el estado real tras la acción, no una transición inventada.
    new_status: input.newStatus || input.subscription.status,
    reason: input.reason,
    actor_type: input.actorType,
    actor_id: input.actorId,
    correlation_id: input.correlationId,
    metadata: input.metadata || {},
  });
  if (error) {
    // El evento es la bitácora de la acción. Si no se puede escribir, la acción
    // se reporta como fallida aunque el UPDATE ya haya ocurrido: es preferible
    // un reintento idempotente a una transición sin rastro.
    console.error("[billing] subscription event insert failed", {
      code: error.code,
      reason: input.reason,
    });
    return false;
  }
  return true;
}

export interface CancelResult {
  scheduled: true;
  alreadyScheduled: boolean;
  subscriptionId: string;
  status: string;
  accessEndsAt: string | null;
}

/**
 * Programa la baja al final del período pagado.
 *
 * Idempotente: repetir la llamada con la baja ya programada devuelve el mismo
 * resultado con `alreadyScheduled=true` y no escribe un segundo evento.
 */
export async function scheduleCancellation(
  context: SubscriptionActionContext,
): Promise<ActionResult<CancelResult>> {
  const { subscription } = context;

  if (!CANCELLABLE_STATUSES.includes(subscription.status as "trial" | "active")) {
    return failure(
      "SUBSCRIPTION_NOT_CANCELLABLE",
      409,
      "Solo una suscripción vigente puede programar su cancelación",
    );
  }

  if (subscription.cancel_at_period_end === true) {
    return {
      ok: true,
      value: {
        scheduled: true,
        alreadyScheduled: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        accessEndsAt: subscription.current_period_end,
      },
    };
  }

  // Una suscripción `active` cuyo período ya venció está esperando al cron:
  // programar la baja aquí produciría un `cancelled` inmediato en la siguiente
  // corrida, sin el período pagado que el cliente espera conservar.
  if (subscription.status === "active" && !isFuture(subscription.current_period_end)) {
    return failure(
      "SUBSCRIPTION_PERIOD_ENDED",
      409,
      "El período facturado ya venció. Actualiza el pago antes de gestionar la baja.",
    );
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("id", subscription.id)
    .eq("status", subscription.status)
    .eq("cancel_at_period_end", false)
    .select("id");

  if (error) {
    return failure("WRITE_FAILED", 500, "No se pudo programar la cancelación");
  }
  if (Array.isArray(updated) && updated.length === 0) {
    return failure(
      "CONCURRENT_MODIFICATION",
      409,
      "La suscripción cambió mientras procesábamos la solicitud. Vuelve a intentarlo.",
    );
  }

  const recorded = await recordSubscriptionEvent({
    subscription,
    organizationId: context.organizationId,
    reason: "cancel_scheduled_by_user",
    actorType: "user",
    actorId: context.userId,
    correlationId: `cancel:${subscription.id}:${subscription.current_period_end || "no-period"}`,
    metadata: {
      cancel_at_period_end: true,
      effective_at: subscription.current_period_end,
    },
  });
  if (!recorded) {
    return failure("WRITE_FAILED", 500, "No se pudo registrar la cancelación");
  }

  return {
    ok: true,
    value: {
      scheduled: true,
      alreadyScheduled: false,
      subscriptionId: subscription.id,
      status: subscription.status,
      accessEndsAt: subscription.current_period_end,
    },
  };
}

export interface ResumeResult {
  resumed: true;
  alreadyActive: boolean;
  subscriptionId: string;
  status: string;
  currentPeriodEnd: string | null;
}

/**
 * Revierte una baja programada ("Mantener suscripción").
 *
 * No reactiva nada: solo es válida mientras la suscripción sigue vigente y el
 * cron todavía no la movió a `cancelled`.
 */
export async function revertScheduledCancellation(
  context: SubscriptionActionContext,
): Promise<ActionResult<ResumeResult>> {
  const { subscription } = context;

  if (!CANCELLABLE_STATUSES.includes(subscription.status as "trial" | "active")) {
    return failure(
      "SUBSCRIPTION_NOT_CANCELLABLE",
      409,
      "La suscripción ya no está vigente. Reactívala con un pago.",
    );
  }

  if (subscription.cancel_at_period_end !== true) {
    return {
      ok: true,
      value: {
        resumed: true,
        alreadyActive: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
      },
    };
  }

  if (subscription.status === "active" && !isFuture(subscription.current_period_end)) {
    return failure(
      "SUBSCRIPTION_PERIOD_ENDED",
      409,
      "El período facturado ya venció. Renueva el pago para continuar.",
    );
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("id", subscription.id)
    .eq("status", subscription.status)
    .eq("cancel_at_period_end", true)
    .select("id");

  if (error) {
    return failure("WRITE_FAILED", 500, "No se pudo mantener la suscripción");
  }
  if (Array.isArray(updated) && updated.length === 0) {
    return failure(
      "CONCURRENT_MODIFICATION",
      409,
      "La suscripción cambió mientras procesábamos la solicitud. Vuelve a intentarlo.",
    );
  }

  const recorded = await recordSubscriptionEvent({
    subscription,
    organizationId: context.organizationId,
    reason: "cancel_scheduled_reverted_by_user",
    actorType: "user",
    actorId: context.userId,
    correlationId: `resume:${subscription.id}:${subscription.current_period_end || "no-period"}`,
    metadata: { cancel_at_period_end: false },
  });
  if (!recorded) {
    return failure("WRITE_FAILED", 500, "No se pudo registrar la solicitud");
  }

  return {
    ok: true,
    value: {
      resumed: true,
      alreadyActive: false,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
    },
  };
}

export function actionErrorResponse(result: Extract<ActionResult<never>, { ok: false }>) {
  return Response.json(
    { error: result.message, code: result.code },
    { status: result.status },
  );
}

export { recordSubscriptionEvent };
