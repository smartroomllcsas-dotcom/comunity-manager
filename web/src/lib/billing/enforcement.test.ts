// Pruebas de enforcement de billing (motor compartido por todas las superficies:
// posts, flujos/chatbot, reportes, almacenamiento, IA, broadcasts).
//
// Cubre los escenarios de borde pedidos, usando POSTS_MONTH como feature
// representativa con límite numérico (todas las superficies con cupo usan la
// misma ruta de decisión en checkBillingFeature):
//   - límite -1  → uso justo por debajo del límite  → PERMITIDO
//   - límite exacto → uso == límite (la siguiente unidad excede) → BLOQUEADO (402)
//   - límite +1  → uso por encima del límite → BLOQUEADO (402)
//   - superadmin → sin límites → PERMITIDO
//   - sin suscripción activa → BLOQUEADO (402, BILLING_SUBSCRIPTION_REQUIRED)
//
// Supabase (admin + server) está mockeado; no se toca la base de datos real.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const cfg: {
    tables: Record<string, { data: unknown; error: unknown }>;
    userId: string | null;
  } = { tables: {}, userId: "user-1" };

  function makeBuilder(table: string) {
    const result = () => cfg.tables[table] ?? { data: null, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    const chain = () => builder;
    for (const m of [
      "select", "eq", "neq", "in", "order", "limit",
      "gte", "lt", "lte", "contains", "overlaps",
    ]) {
      builder[m] = chain;
    }
    builder.maybeSingle = async () => result();
    builder.single = async () => result();
    // insert(...) se usa como `await from(t).insert(row)` (thenable) y también
    // como `from(t).insert(row).select(...).single()`.
    builder.insert = () => ({
      select: () => ({ single: async () => result() }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    });
    return builder;
  }

  const admin = {
    from: (t: string) => makeBuilder(t),
    rpc: async () => ({ data: true, error: null }),
  };
  const server = {
    auth: {
      getUser: async () => ({
        data: { user: cfg.userId ? { id: cfg.userId } : null },
      }),
    },
  };
  return { cfg, admin, server };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.server }));

import { checkBillingFeature, billingDeniedResponse } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

const LIMIT = 10;

function setupTables(opts: {
  superAdmin?: boolean;
  usage?: number;
  hasSubscription?: boolean;
  planPrice?: number;
}) {
  const subscription = opts.hasSubscription === false
    ? { data: null, error: null }
    : {
        data: {
          id: "sub-1",
          status: "active",
          current_period_start: "2026-08-01T00:00:00.000Z",
          current_period_end: "2026-09-01T00:00:00.000Z",
          trial_ends_at: null,
          grace_ends_at: null,
        },
        error: null,
      };

  h.cfg.tables = {
    agents: {
      data: {
        is_super_admin: opts.superAdmin ?? false,
        email: opts.superAdmin
          ? "leonelzc2005@gmail.com"
          : "customer@example.invalid",
      },
      error: null,
    },
    organizations: {
      data: {
        id: "org-1",
        is_active: true,
        plan_id: "plan-1",
        billing_enforcement_mode: "hard",
        trial_ends_at: null,
        onboarding_status: "active",
        plan: { price_monthly: opts.planPrice ?? 0 },
      },
      error: null,
    },
    subscriptions: subscription,
    plan_entitlements: {
      data: { enabled: true, limit_value: LIMIT, reset_interval: "month", overage_policy: "block" },
      error: null,
    },
    usage_counters: { data: { quantity: opts.usage ?? 0 }, error: null },
    billing_decision_events: { data: null, error: null },
  };
}

function check() {
  return checkBillingFeature({
    organizationId: "org-1",
    featureCode: BILLING_FEATURES.POSTS_MONTH,
    requestedUnits: 1,
    source: "test",
  });
}

describe("checkBillingFeature enforcement", () => {
  beforeEach(() => {
    process.env.BILLING_ENFORCEMENT_MODE = "hard";
    h.cfg.userId = "user-1";
  });

  it("límite -1: uso 9/10 permite la acción (llega justo al límite)", async () => {
    setupTables({ usage: LIMIT - 1 });
    const decision = await check();
    expect(decision.allowed).toBe(true);
    expect(decision.wouldBlock).toBe(false);
    expect(decision.reason).toBe("within_limit");
    expect(decision.currentUsage).toBe(LIMIT - 1);
    expect(decision.limitValue).toBe(LIMIT);
  });

  it("límite exacto: uso 10/10 bloquea la siguiente acción (402)", async () => {
    setupTables({ usage: LIMIT });
    const decision = await check();
    expect(decision.allowed).toBe(false);
    expect(decision.wouldBlock).toBe(true);
    expect(decision.reason).toBe("limit_reached");
    const res = billingDeniedResponse(decision);
    expect(res.status).toBe(402);
  });

  it("límite +1: uso 11/10 bloquea la acción (402)", async () => {
    setupTables({ usage: LIMIT + 1 });
    const decision = await check();
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("limit_reached");
    const res = billingDeniedResponse(decision);
    expect(res.status).toBe(402);
  });

  it("superadmin: sin límites aunque el uso supere el límite", async () => {
    setupTables({ superAdmin: true, usage: LIMIT * 100 });
    const decision = await check();
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("unlimited");
    expect(decision.mode).toBe("off");
  });

  it("webhook sin sesión: la organización del superadmin continúa ilimitada", async () => {
    h.cfg.userId = null;
    setupTables({ superAdmin: true, usage: LIMIT * 100 });
    const decision = await check();
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("unlimited");
    expect(decision.mode).toBe("off");
  });

  it("webhook sin sesión: una organización cliente conserva sus límites", async () => {
    h.cfg.userId = null;
    setupTables({ superAdmin: false, usage: LIMIT });
    const decision = await check();
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("limit_reached");
    expect(billingDeniedResponse(decision).status).toBe(402);
  });

  it("plan gratuito activo sin suscripción: aplica sus límites y permite mientras haya cupo", async () => {
    setupTables({ hasSubscription: false, usage: 0 });
    const decision = await check();
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("within_limit");
    expect(decision.currentUsage).toBe(0);
    expect(decision.limitValue).toBe(LIMIT);
  });

  it("plan pago sin suscripción activa: bloquea con BILLING_SUBSCRIPTION_REQUIRED", async () => {
    setupTables({ hasSubscription: false, usage: 0, planPrice: 59_000 });
    const decision = await check();
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("subscription_inactive");
    const res = billingDeniedResponse(decision);
    expect(res.status).toBe(402);
    const payload = (await res.json()) as { code: string };
    expect(payload.code).toBe("BILLING_SUBSCRIPTION_REQUIRED");
  });
});
