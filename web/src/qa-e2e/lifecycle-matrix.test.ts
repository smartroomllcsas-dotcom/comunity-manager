// E2E QA · Matriz de ciclo de vida.
//
// Recorre los mismos ocho estados que siembra el fixture SQL
// (smarttalk.qa_seed_lifecycle_case) y comprueba, para cada uno, que:
//   (a) el backend concede o niega acceso según lo esperado (checkBillingFeature);
//   (b) la pantalla exige pago exactamente cuando el backend niega el acceso o
//       el estado lo requiere (deriveSubscriptionUi).
//
// El valor de cruzar ambas es detectar desincronizaciones: una UI que ofrece
// «Reactivar» sobre una cuenta que en realidad sigue teniendo acceso, o al
// revés, una cuenta bloqueada que la pantalla presenta como activa.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";
import {
  LIFECYCLE_CASES,
  LIFECYCLE_FIXTURES,
  entitlementRow,
  orgRow,
  type LifecycleCase,
} from "./helpers/fixtures";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { deriveSubscriptionUi } from "@/lib/billing/subscription-ui";

beforeEach(() => {
  process.env.BILLING_ENFORCEMENT_MODE = "hard";
});

function seedCase(testCase: LifecycleCase) {
  H.current = createFakeSupabase({
    tables: {
      organizations: [orgRow()],
      subscriptions: [LIFECYCLE_FIXTURES[testCase].subscription],
      // Límite ilimitado: sólo el estado de la suscripción decide el acceso.
      plan_entitlements: [entitlementRow(BILLING_FEATURES.CONTACTS_TOTAL, null)],
      billing_decision_events: [],
    },
  });
}

const decide = () =>
  checkBillingFeature({
    organizationId: "org-qa",
    featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
    source: "qa-lifecycle-matrix",
  });

describe("Matriz de ciclo de vida · acceso concedido por el backend", () => {
  it.each(LIFECYCLE_CASES)("%s", async (testCase) => {
    seedCase(testCase);
    const fixture = LIFECYCLE_FIXTURES[testCase];
    const decision = await decide();

    expect(decision.allowed, `${testCase}: acceso inesperado`).toBe(fixture.hasAccess);
    expect(decision.reason).toBe(fixture.hasAccess ? "unlimited" : "subscription_inactive");
  });
});

describe("Matriz de ciclo de vida · estado de pantalla", () => {
  it.each(LIFECYCLE_CASES)("%s", (testCase) => {
    const fixture = LIFECYCLE_FIXTURES[testCase];
    const ui = deriveSubscriptionUi(fixture.subscription, { isAdmin: true });

    expect(ui.requiresPayment, `${testCase}: expectativa de pago incorrecta`).toBe(
      fixture.requiresPayment,
    );
  });
});

describe("Matriz de ciclo de vida · coherencia backend ↔ pantalla", () => {
  it.each(LIFECYCLE_CASES)(
    "%s: si el backend niega el acceso, la pantalla exige pago",
    async (testCase) => {
      seedCase(testCase);
      const decision = await decide();
      const ui = deriveSubscriptionUi(LIFECYCLE_FIXTURES[testCase].subscription, { isAdmin: true });

      if (!decision.allowed) {
        expect(ui.requiresPayment, `${testCase}: bloqueado pero la UI no pide pago`).toBe(true);
        expect(ui.actions.every((action) => action === "renew" || action === "reactivate")).toBe(true);
      }
    },
  );

  it.each(LIFECYCLE_CASES)(
    "%s: si la pantalla ofrece cancelar, el backend concede acceso",
    async (testCase) => {
      seedCase(testCase);
      const decision = await decide();
      const ui = deriveSubscriptionUi(LIFECYCLE_FIXTURES[testCase].subscription, { isAdmin: true });

      if (ui.actions.includes("cancel")) {
        expect(decision.allowed, `${testCase}: la UI ofrece cancelar sin acceso vigente`).toBe(true);
      }
    },
  );

  it("los estados que conservan acceso son exactamente los esperados", async () => {
    const withAccess: string[] = [];
    for (const testCase of LIFECYCLE_CASES) {
      seedCase(testCase);
      if ((await decide()).allowed) withAccess.push(testCase);
    }
    expect(withAccess.sort()).toEqual(
      ["active", "grace_period", "past_due", "plan_change", "renewal", "scheduled_cancellation"].sort(),
    );
  });

  it("la baja programada conserva el acceso completo hasta el fin del período", async () => {
    seedCase("scheduled_cancellation");
    const decision = await decide();
    const ui = deriveSubscriptionUi(LIFECYCLE_FIXTURES.scheduled_cancellation.subscription, {
      isAdmin: true,
    });

    expect(decision.allowed).toBe(true);
    expect(ui.state).toBe("scheduled_cancellation");
    expect(ui.actions).toEqual(["resume"]);
    expect(ui.accessEndsAt).toBe(
      LIFECYCLE_FIXTURES.scheduled_cancellation.subscription.current_period_end,
    );
  });

  it("suspended y cancelled nunca conservan acceso", async () => {
    for (const testCase of ["suspended", "cancelled"] as const) {
      seedCase(testCase);
      const decision = await decide();
      expect(decision.allowed, `${testCase} no debe tener acceso`).toBe(false);
      expect(decision.reason).toBe("subscription_inactive");
    }
  });
});
