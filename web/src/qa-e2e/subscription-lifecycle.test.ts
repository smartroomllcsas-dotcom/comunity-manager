// E2E QA · Requisito 5: ciclo de vida de suscripciones.
// Parte A: efecto del estado de la suscripción sobre el acceso (checkBillingFeature).
// Parte B: transiciones del cron de ciclo de vida (active -> past_due/cancelled,
//          past_due -> suspended) sin tocar el código de billing (sólo se importa).
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";
import { orgRow, subscriptionRow, entitlementRow } from "./helpers/fixtures";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { GET as billingLifecycle } from "@/app/api/cron/billing-lifecycle/route";

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

beforeEach(() => { process.env.BILLING_ENFORCEMENT_MODE = "hard"; });

describe("E2E QA · Ciclo de vida — acceso según estado", () => {
  function seedSub(sub: Record<string, unknown>) {
    H.current = createFakeSupabase({
      tables: {
        organizations: [orgRow()],
        subscriptions: [subscriptionRow(sub)],
        // límite ilimitado: sólo el estado de la suscripción decide el acceso
        plan_entitlements: [entitlementRow(BILLING_FEATURES.CONTACTS_TOTAL, null)],
        billing_decision_events: [],
      },
    });
  }
  const decide = () =>
    checkBillingFeature({ organizationId: "org-qa", featureCode: BILLING_FEATURES.CONTACTS_TOTAL, source: "qa" });

  const CASES: Array<[string, Record<string, unknown>, boolean, string]> = [
    ["trial vigente", { status: "trial", trial_ends_at: future() }, true, "unlimited"],
    ["trial vencido", { status: "trial", trial_ends_at: past() }, false, "subscription_inactive"],
    ["active", { status: "active" }, true, "unlimited"],
    ["past_due dentro de gracia", { status: "past_due", grace_ends_at: future() }, true, "unlimited"],
    ["past_due gracia vencida", { status: "past_due", grace_ends_at: past() }, false, "subscription_inactive"],
    ["suspended", { status: "suspended" }, false, "subscription_inactive"],
    ["cancelled", { status: "cancelled" }, false, "subscription_inactive"],
  ];

  it.each(CASES)("%s => acceso=%s", async (_name, sub, allowed, reason) => {
    seedSub(sub);
    const d = await decide();
    expect(d.allowed).toBe(allowed);
    expect(d.reason).toBe(reason);
  });
});

describe("E2E QA · Ciclo de vida — transiciones del cron", () => {
  const SECRET = "qa-cron-secret";
  function authedRequest() {
    return {
      headers: { get: (h: string) => (h === "authorization" ? `Bearer ${SECRET}` : null) },
    } as unknown as Parameters<typeof billingLifecycle>[0];
  }

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.BILLING_GRACE_DAYS = "3";
    H.current = createFakeSupabase({
      tables: {
        subscriptions: [
          { id: "s-expira", organization_id: "o1", status: "active", current_period_end: past(), cancel_at_period_end: false, grace_ends_at: null },
          { id: "s-cancela", organization_id: "o1", status: "active", current_period_end: past(), cancel_at_period_end: true, grace_ends_at: null },
          { id: "s-gracia-vencida", organization_id: "o1", status: "past_due", grace_ends_at: past() },
          { id: "s-vigente", organization_id: "o1", status: "active", current_period_end: future(), cancel_at_period_end: false },
        ],
        subscription_events: [],
      },
    });
  });

  it("rechaza sin CRON_SECRET válido (401)", async () => {
    const res = await billingLifecycle({ headers: { get: () => null } } as unknown as Parameters<typeof billingLifecycle>[0]);
    expect(res.status).toBe(401);
  });

  it("mueve active vencida a past_due, active con cancel_at_period_end a cancelled y past_due sin gracia a suspended", async () => {
    const res = await billingLifecycle(authedRequest());
    const body = (await res.json()) as { movedToPastDue: number; cancelled: number; suspended: number };
    expect(body).toMatchObject({ movedToPastDue: 1, cancelled: 1, suspended: 1 });

    const byId = (id: string) =>
      (H.current!.store.subscriptions as Array<{ id: string; status: string }>).find((s) => s.id === id)!;
    expect(byId("s-expira").status).toBe("past_due");
    expect(byId("s-cancela").status).toBe("cancelled");
    expect(byId("s-gracia-vencida").status).toBe("suspended");
    expect(byId("s-vigente").status).toBe("active"); // no vencida => intacta
  });
});
