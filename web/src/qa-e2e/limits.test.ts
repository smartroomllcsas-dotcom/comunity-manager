// E2E QA · Requisito 3: límites de marcas, canales, asesores y contactos.
// Ejercita checkBillingFeature (motor real) en modo hard, en la frontera de
// cada límite: -1 permite, exacto bloquea (402) y +1 bloquea. Incluye el
// bypass del superadmin.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";
import { orgRow, subscriptionRow, entitlementRow, repeat } from "./helpers/fixtures";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { checkBillingFeature, billingDeniedResponse } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

interface LimitCase {
  name: string;
  feature: string;
  limit: number;
  table: string;
  row: (i: number) => Record<string, unknown>;
}

const LIMITS: LimitCase[] = [
  {
    name: "marcas", feature: BILLING_FEATURES.BRANDS_TOTAL, limit: 5, table: "cm_clients",
    row: (i) => ({ id: `brand-${i}`, smarttalk_organization_id: "org-qa" }),
  },
  {
    name: "canales", feature: BILLING_FEATURES.CHANNELS_ACTIVE, limit: 3, table: "channels",
    row: (i) => ({ id: `chan-${i}`, organization_id: "org-qa", status: "active" }),
  },
  {
    name: "asesores", feature: BILLING_FEATURES.BRAND_ADVISORS_TOTAL, limit: 5, table: "agents",
    row: (i) => ({ id: `adv-${i}`, organization_id: "org-qa", member_type: "brand_advisor" }),
  },
  {
    name: "contactos", feature: BILLING_FEATURES.CONTACTS_TOTAL, limit: 1000, table: "contacts",
    row: (i) => ({ id: `contact-${i}`, organization_id: "org-qa" }),
  },
];

function seedLimit(c: LimitCase, usage: number, currentUserId = "user-default") {
  H.current = createFakeSupabase({
    currentUserId,
    tables: {
      organizations: [orgRow()],
      subscriptions: [subscriptionRow()],
      plan_entitlements: [entitlementRow(c.feature, c.limit)],
      billing_decision_events: [],
      [c.table]: repeat(usage, c.row),
    },
  });
}

const check = (feature: string) =>
  checkBillingFeature({ organizationId: "org-qa", featureCode: feature as never, requestedUnits: 1, source: "qa" });

beforeEach(() => { process.env.BILLING_ENFORCEMENT_MODE = "hard"; });
afterEach(() => { vi.clearAllMocks(); });

describe("E2E QA · Límites de plan (marcas / canales / asesores / contactos)", () => {
  it.each(LIMITS)("$name: límite -1 permite la acción", async (c) => {
    seedLimit(c, c.limit - 1);
    const d = await check(c.feature);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("within_limit");
    expect(d.limitValue).toBe(c.limit);
  });

  it.each(LIMITS)("$name: límite exacto bloquea con 402", async (c) => {
    seedLimit(c, c.limit);
    const d = await check(c.feature);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("limit_reached");
    expect(billingDeniedResponse(d).status).toBe(402);
  });

  it.each(LIMITS)("$name: límite +1 bloquea con 402", async (c) => {
    seedLimit(c, c.limit + 1);
    const d = await check(c.feature);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("limit_reached");
    expect(billingDeniedResponse(d).status).toBe(402);
  });

  it("superadmin: sin límites aunque el uso exceda el límite", async () => {
    const brands = LIMITS[0];
    H.current = createFakeSupabase({
      currentUserId: "super-user",
      tables: {
        agents: [{ id: "super-user", is_super_admin: true, organization_id: "org-qa" }],
        organizations: [orgRow()],
        subscriptions: [subscriptionRow()],
        plan_entitlements: [entitlementRow(brands.feature, brands.limit)],
        billing_decision_events: [],
        cm_clients: repeat(brands.limit + 50, brands.row),
      },
    });
    const d = await check(brands.feature);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("unlimited");
  });
});
