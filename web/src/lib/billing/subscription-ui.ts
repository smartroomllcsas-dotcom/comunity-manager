/**
 * Derivación pura del estado de suscripción que ve el cliente en
 * `/settings/billing`.
 *
 * Vive fuera del componente para que las reglas de pantalla —qué botón se
 * muestra, qué aviso aparece, hasta cuándo hay acceso— se puedan probar sin
 * montar React ni añadir dependencias de testing DOM.
 *
 * Regla transversal: ninguna acción de esta pantalla activa una suscripción.
 * `reactivate` y `renew` llevan al checkout; el estado solo cambia cuando el
 * proveedor confirma el pago.
 */

export type SubscriptionUiState =
  | "none"
  | "trial"
  | "active"
  | "scheduled_cancellation"
  | "grace"
  | "expired"
  | "suspended"
  | "cancelled";

export type SubscriptionUiAction = "cancel" | "resume" | "renew" | "reactivate";

export interface SubscriptionUiInput {
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  grace_ends_at?: string | null;
  /** D-5: plan al que se bajará al terminar el período vigente, si lo hay. */
  pending_plan_id?: string | null;
  change_effective_at?: string | null;
}

/** Cambio de plan programado que el cliente debe ver anunciado. */
export interface PendingPlanChange {
  pendingPlanId: string;
  effectiveAt: string | null;
  /** Texto listo para mostrar, con la fecha ya formateada. */
  notice: string;
}

/**
 * D-5 · Aviso de downgrade diferido.
 *
 * Devuelve el cambio pendiente sólo si de verdad queda por aplicarse. Un cambio
 * cuya fecha ya pasó está a la espera del cron, así que anunciarlo como futuro
 * sería mentir.
 */
export function derivePendingPlanChange(
  subscription: SubscriptionUiInput | null | undefined,
  options: { now?: number; planName?: string | null } = {},
): PendingPlanChange | null {
  if (!subscription?.pending_plan_id) return null;
  const now = options.now ?? Date.now();
  const effectiveAt = subscription.change_effective_at ?? null;
  if (!isFuture(effectiveAt, now)) return null;

  const when = formatDate(effectiveAt);
  const target = options.planName ? `al plan ${options.planName}` : "al plan que contrataste";
  return {
    pendingPlanId: subscription.pending_plan_id,
    effectiveAt,
    notice: when
      ? `Tu cambio ${target} se aplicará el ${when}. Hasta esa fecha conservas tu plan actual y todos sus límites.`
      : `Tu cambio ${target} se aplicará al terminar el período actual. Hasta entonces conservas tu plan actual y todos sus límites.`,
  };
}

/**
 * Clasifica un plan destino frente al actual para poder avisar en el botón.
 *
 * `downgrade` es lo único que se difiere; el resto se aplica al aprobarse el
 * pago. Sin precio comparable devuelve `unknown` en vez de adivinar.
 */
export function classifyPlanChange(input: {
  currentAmountMinor?: number | null;
  targetAmountMinor?: number | null;
  isCurrentPlan?: boolean;
}): "current" | "upgrade" | "downgrade" | "unknown" {
  if (input.isCurrentPlan) return "current";
  const current = input.currentAmountMinor;
  const target = input.targetAmountMinor;
  if (typeof current !== "number" || typeof target !== "number") return "unknown";
  if (target < current) return "downgrade";
  return "upgrade";
}

export interface SubscriptionUiModel {
  state: SubscriptionUiState;
  /** Etiqueta corta del estado, ya traducida. */
  statusLabel: string;
  /** Acciones que la pantalla debe ofrecer, en orden de prioridad. */
  actions: SubscriptionUiAction[];
  /** Fecha hasta la que el cliente conserva acceso (ISO) o null. */
  accessEndsAt: string | null;
  /** Texto del aviso destacado, o null si no hay nada que advertir. */
  noticeText: string | null;
  noticeTone: "info" | "warning" | "danger" | null;
  /** True cuando salir del estado exige un pago aprobado. */
  requiresPayment: boolean;
}

function isFuture(value: string | null | undefined, now: number) {
  return Boolean(value && new Date(value).getTime() > now);
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Traduce la suscripción a lo que la pantalla debe mostrar.
 *
 * @param subscription fila de `subscriptions`, o null si la organización no tiene.
 * @param options.isAdmin solo un administrador puede gestionar la suscripción.
 * @param options.now inyectable para pruebas deterministas.
 */
export function deriveSubscriptionUi(
  subscription: SubscriptionUiInput | null | undefined,
  options: { isAdmin: boolean; now?: number } = { isAdmin: false },
): SubscriptionUiModel {
  const now = options.now ?? Date.now();
  const isAdmin = options.isAdmin === true;

  if (!subscription || !subscription.status) {
    return {
      state: "none",
      statusLabel: "Sin suscripción",
      actions: isAdmin ? ["reactivate"] : [],
      accessEndsAt: null,
      noticeText:
        "No tienes una suscripción activa. Contrata un plan para habilitar marcas, canales y contactos.",
      noticeTone: "danger",
      requiresPayment: true,
    };
  }

  const status = String(subscription.status);
  const periodEnd = subscription.current_period_end ?? null;
  const scheduledCancellation = subscription.cancel_at_period_end === true;

  if (status === "suspended") {
    return {
      state: "suspended",
      statusLabel: "Suspendida",
      actions: isAdmin ? ["reactivate"] : [],
      accessEndsAt: null,
      noticeText:
        "Tu suscripción está suspendida porque venció el período de gracia. Reactívala con un pago para recuperar el acceso.",
      noticeTone: "danger",
      requiresPayment: true,
    };
  }

  if (status === "cancelled") {
    return {
      state: "cancelled",
      statusLabel: "Cancelada",
      actions: isAdmin ? ["reactivate"] : [],
      accessEndsAt: null,
      noticeText:
        "Tu suscripción está cancelada. Reactívala con un pago para volver a usar el plan.",
      noticeTone: "danger",
      requiresPayment: true,
    };
  }

  if (status === "past_due") {
    const inGrace = isFuture(subscription.grace_ends_at, now);
    if (inGrace) {
      return {
        state: "grace",
        statusLabel: "Pago pendiente",
        actions: isAdmin ? ["renew"] : [],
        accessEndsAt: subscription.grace_ends_at ?? null,
        noticeText: `No recibimos el pago del período. Conservas el acceso hasta el ${
          formatDate(subscription.grace_ends_at) || "fin del período de gracia"
        }; después la cuenta se suspende.`,
        noticeTone: "warning",
        requiresPayment: true,
      };
    }
    return {
      state: "expired",
      statusLabel: "Vencida",
      actions: isAdmin ? ["renew"] : [],
      accessEndsAt: null,
      noticeText:
        "El período de gracia terminó. Actualiza el pago para restablecer el acceso.",
      noticeTone: "danger",
      requiresPayment: true,
    };
  }

  // trial / active
  const isTrial = status === "trial";
  const trialValid = isTrial && isFuture(subscription.trial_ends_at, now);
  const periodValid = isFuture(periodEnd, now);

  if (isTrial && !trialValid) {
    return {
      state: "expired",
      statusLabel: "Trial vencido",
      actions: isAdmin ? ["renew"] : [],
      accessEndsAt: null,
      noticeText: "Tu período de prueba terminó. Contrata un plan para continuar.",
      noticeTone: "danger",
      requiresPayment: true,
    };
  }

  if (scheduledCancellation) {
    const endLabel = formatDate(isTrial ? subscription.trial_ends_at : periodEnd);
    return {
      state: "scheduled_cancellation",
      statusLabel: isTrial ? "Trial · baja programada" : "Activa · baja programada",
      actions: isAdmin ? ["resume"] : [],
      accessEndsAt: (isTrial ? subscription.trial_ends_at : periodEnd) ?? null,
      noticeText: endLabel
        ? `Tu suscripción se cancelará el ${endLabel}. Conservas el acceso completo hasta esa fecha.`
        : "Tu suscripción se cancelará al terminar el período actual.",
      noticeTone: "warning",
      requiresPayment: false,
    };
  }

  if (!isTrial && !periodValid) {
    // `active` con período vencido: el cron todavía no la procesó.
    return {
      state: "expired",
      statusLabel: "Pendiente de renovación",
      actions: isAdmin ? ["renew"] : [],
      accessEndsAt: periodEnd,
      noticeText:
        "El período facturado terminó y estamos a la espera del pago de renovación.",
      noticeTone: "warning",
      requiresPayment: true,
    };
  }

  return {
    state: isTrial ? "trial" : "active",
    statusLabel: isTrial ? "Trial" : "Activa",
    actions: isAdmin ? ["cancel"] : [],
    accessEndsAt: (isTrial ? subscription.trial_ends_at : periodEnd) ?? null,
    noticeText: null,
    noticeTone: null,
    requiresPayment: false,
  };
}

/** Etiqueta del botón principal para cada acción. */
export const SUBSCRIPTION_ACTION_LABELS: Record<SubscriptionUiAction, string> = {
  cancel: "Cancelar al final del periodo",
  resume: "Mantener suscripción",
  renew: "Actualizar pago / Renovar",
  reactivate: "Reactivar plan",
};
