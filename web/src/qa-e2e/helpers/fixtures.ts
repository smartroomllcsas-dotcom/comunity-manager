// Fixtures compartidos por las pruebas E2E de QA.
// Matriz de planes tomada de DATOS_PRUEBA_BILLING.md (los tres planes demo).
// Los valores de contactos para Crecimiento/Escala no están documentados como
// número exacto (sólo Inicial = 1.000); se usan valores de fixture para las
// pruebas de mapeo y se marcan como tales en el informe.

export interface PlanSpec {
  code: string;
  name: string;
  amountMinor: number;
  agencyUsers: number;
  advisorsTotal: number;
  advisorsPerBrand: number;
  brands: number;
  channels: number;
  contacts: number;
  ai: boolean;
}

export const PLAN_MATRIX: Record<string, PlanSpec> = {
  "demo-inicial-2026": {
    code: "demo-inicial-2026", name: "Demo Inicial", amountMinor: 5_900_000,
    agencyUsers: 2, advisorsTotal: 5, advisorsPerBrand: 2, brands: 5, channels: 3,
    contacts: 1000, ai: true,
  },
  "demo-crecimiento-2026": {
    code: "demo-crecimiento-2026", name: "Demo Crecimiento", amountMinor: 14_900_000,
    agencyUsers: 5, advisorsTotal: 20, advisorsPerBrand: 5, brands: 15, channels: 10,
    contacts: 5000, ai: true,
  },
  "demo-escala-2026": {
    code: "demo-escala-2026", name: "Demo Escala", amountMinor: 29_900_000,
    agencyUsers: 15, advisorsTotal: 75, advisorsPerBrand: 15, brands: 50, channels: 30,
    contacts: 20000, ai: true,
  },
};

export const DOCUMENTED_CONTACTS: Record<string, number> = {
  // Único valor de contactos documentado explícitamente (qa-plan-limit-seed.md).
  "demo-inicial-2026": 1000,
};

const PAST = "2020-01-01T00:00:00.000Z";

/** Fila de plan con la forma que consume getPublicPlans (prices + entitlements). */
export function planRow(spec: PlanSpec, planId = `plan-${spec.code}`) {
  return {
    id: planId,
    code: spec.code,
    name: `Demo ${spec.name.replace(/^Demo\s+/i, "")}`,
    description: null,
    max_agents: spec.agencyUsers,
    max_contacts: spec.contacts,
    ai_enabled: spec.ai,
    status: "active",
    is_public: true,
    prices: [
      {
        amount_minor: spec.amountMinor, currency: "COP", billing_interval: "month",
        provider: "epayco", active_from: PAST, active_to: null,
      },
    ],
    entitlements: [
      { feature_code: "agency.users", enabled: true, limit_value: spec.agencyUsers },
      { feature_code: "brand.advisors_total", enabled: true, limit_value: spec.advisorsTotal },
      { feature_code: "brand.advisors_per_brand", enabled: true, limit_value: spec.advisorsPerBrand },
      { feature_code: "brands.total", enabled: true, limit_value: spec.brands },
      { feature_code: "channels.active", enabled: true, limit_value: spec.channels },
    ],
  };
}

export const EPAYCO_ENABLED_GATEWAY = {
  gateway: "epayco", is_enabled: true, checkout_enabled: true, priority: 1,
};

/** Organización activa con enforcement en modo hard. */
export function orgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-qa",
    is_active: true,
    plan_id: "plan-qa",
    billing_enforcement_mode: "hard",
    trial_ends_at: null,
    onboarding_status: "active",
    plan: { price_monthly: 0 },
    ...overrides,
  };
}

/** Suscripción activa por defecto; overridear status/fechas para el ciclo de vida. */
export function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-qa",
    organization_id: "org-qa",
    status: "active",
    current_period_start: "2026-08-01T00:00:00.000Z",
    current_period_end: "2026-09-01T00:00:00.000Z",
    trial_ends_at: null,
    grace_ends_at: null,
    cancel_at_period_end: false,
    ...overrides,
  };
}

/** Entitlement con límite numérico y política de bloqueo. */
export function entitlementRow(
  featureCode: string,
  limitValue: number | null,
  overrides: Record<string, unknown> = {}
) {
  return {
    plan_id: "plan-qa",
    feature_code: featureCode,
    enabled: true,
    limit_value: limitValue,
    reset_interval: "month",
    overage_policy: "block",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Matriz de ciclo de vida.
//
// Espejo en memoria de smarttalk.qa_seed_lifecycle_case (supabase/qa/
// 001_qa_lifecycle_fixtures.sql). Los mismos ocho casos se siembran aquí para
// la suite rápida y allí para la suite contra PostgreSQL, de modo que ambas
// hablen del mismo escenario.
// ---------------------------------------------------------------------------

export type LifecycleCase =
  | "active"
  | "past_due"
  | "grace_period"
  | "past_due_expired"
  | "suspended"
  | "cancelled"
  | "renewal"
  | "plan_change"
  | "scheduled_cancellation";

const DAY_MS = 86_400_000;
const ahead = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
const behind = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

export interface LifecycleFixture {
  /** Fila de `subscriptions` en el estado del caso. */
  subscription: Record<string, unknown>;
  /** ¿La organización conserva acceso a las funcionalidades del plan? */
  hasAccess: boolean;
  /** ¿La pantalla exige un pago para salir de este estado? */
  requiresPayment: boolean;
}

/**
 * Un fixture por estado, con la expectativa de acceso y de pago asociada.
 *
 * `hasAccess` es la verdad que debe respetar `checkBillingFeature`;
 * `requiresPayment` la que debe respetar `deriveSubscriptionUi`. Cruzarlas
 * detecta que backend y UI se desincronicen.
 */
export const LIFECYCLE_FIXTURES: Record<LifecycleCase, LifecycleFixture> = {
  active: {
    subscription: subscriptionRow({
      status: "active",
      current_period_start: behind(15),
      current_period_end: ahead(15),
    }),
    hasAccess: true,
    requiresPayment: false,
  },
  scheduled_cancellation: {
    subscription: subscriptionRow({
      status: "active",
      current_period_start: behind(15),
      current_period_end: ahead(15),
      cancel_at_period_end: true,
    }),
    // Programar la baja no revoca nada hasta el fin del período.
    hasAccess: true,
    requiresPayment: false,
  },
  past_due: {
    subscription: subscriptionRow({
      status: "past_due",
      current_period_end: behind(1),
      grace_ends_at: ahead(2),
    }),
    hasAccess: true,
    requiresPayment: true,
  },
  grace_period: {
    subscription: subscriptionRow({
      status: "past_due",
      current_period_end: behind(1),
      grace_ends_at: ahead(2),
    }),
    hasAccess: true,
    requiresPayment: true,
  },
  past_due_expired: {
    subscription: subscriptionRow({
      status: "past_due",
      current_period_end: behind(4),
      grace_ends_at: behind(1),
    }),
    hasAccess: false,
    requiresPayment: true,
  },
  suspended: {
    subscription: subscriptionRow({
      status: "suspended",
      current_period_end: behind(5),
      grace_ends_at: behind(2),
    }),
    hasAccess: false,
    requiresPayment: true,
  },
  cancelled: {
    subscription: subscriptionRow({
      status: "cancelled",
      current_period_end: behind(5),
      cancel_at_period_end: true,
    }),
    hasAccess: false,
    requiresPayment: true,
  },
  renewal: {
    subscription: subscriptionRow({
      status: "active",
      current_period_start: behind(29),
      current_period_end: ahead(1),
    }),
    hasAccess: true,
    requiresPayment: false,
  },
  plan_change: {
    subscription: subscriptionRow({
      status: "active",
      plan_id: "plan-qa",
      current_period_start: behind(15),
      current_period_end: ahead(15),
    }),
    hasAccess: true,
    requiresPayment: false,
  },
};

export const LIFECYCLE_CASES = Object.keys(LIFECYCLE_FIXTURES) as LifecycleCase[];

/** Genera n filas mínimas con organization_id. */
export function repeat(n: number, make: (i: number) => Record<string, unknown>) {
  return Array.from({ length: Math.max(0, n) }, (_, i) => make(i));
}
