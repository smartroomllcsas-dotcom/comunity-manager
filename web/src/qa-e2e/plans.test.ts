// E2E QA · Requisito 1: pruebas para los tres planes.
// Valida que el sistema resuelve correctamente los entitlements de cada plan
// demo (Inicial / Crecimiento / Escala) en los límites públicos, incluyendo:
//   - mapeo entitlement -> límite público (marcas, canales, asesores, usuarios)
//   - contactos documentados (Inicial = 1.000)
//   - -1 => ilimitado (null)
//   - exclusión cuando la pasarela ePayco no está habilitada
//   - orden por precio ascendente y limpieza del prefijo "Demo"
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";
import {
  PLAN_MATRIX, planRow, EPAYCO_ENABLED_GATEWAY, DOCUMENTED_CONTACTS,
} from "./helpers/fixtures";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { getPublicPlans } from "@/lib/billing/public-plans";

const CODES = ["demo-inicial-2026", "demo-crecimiento-2026", "demo-escala-2026"];

function seedAllPlans(extraGateways: Record<string, unknown>[] = [EPAYCO_ENABLED_GATEWAY]) {
  H.current = createFakeSupabase({
    tables: {
      plans: CODES.map((c) => planRow(PLAN_MATRIX[c])),
      payment_gateway_settings: extraGateways,
    },
  });
}

describe("E2E QA · Planes demo (3 planes)", () => {
  beforeEach(() => seedAllPlans());

  it("expone exactamente los 3 planes demo, ordenados por precio ascendente", async () => {
    const plans = await getPublicPlans();
    expect(plans.map((p) => p.code)).toEqual(CODES);
    expect(plans[0].amountMinor).toBeLessThan(plans[1].amountMinor);
    expect(plans[1].amountMinor).toBeLessThan(plans[2].amountMinor);
  });

  it.each(CODES)("plan %s mapea límites de marcas/canales/asesores/usuarios", async (code) => {
    const plans = await getPublicPlans();
    const plan = plans.find((p) => p.code === code)!;
    const spec = PLAN_MATRIX[code];
    expect(plan.maxBrands).toBe(spec.brands);
    expect(plan.maxChannels).toBe(spec.channels);
    expect(plan.maxBrandAdvisors).toBe(spec.advisorsTotal);
    expect(plan.maxAgencyUsers).toBe(spec.agencyUsers);
    expect(plan.aiEnabled).toBe(spec.ai);
    expect(plan.name.startsWith("Demo ")).toBe(false); // se limpia el prefijo
  });

  it("plan Inicial tiene el límite documentado de contactos (1.000)", async () => {
    const plans = await getPublicPlans();
    const inicial = plans.find((p) => p.code === "demo-inicial-2026")!;
    expect(inicial.maxContacts).toBe(DOCUMENTED_CONTACTS["demo-inicial-2026"]);
  });

  it("un entitlement en -1 se interpreta como ilimitado (null)", async () => {
    const unlimited = planRow({ ...PLAN_MATRIX["demo-escala-2026"] });
    unlimited.entitlements = unlimited.entitlements.map((e) =>
      e.feature_code === "brands.total" ? { ...e, limit_value: -1 } : e
    );
    H.current = createFakeSupabase({
      tables: { plans: [unlimited], payment_gateway_settings: [EPAYCO_ENABLED_GATEWAY] },
    });
    const plans = await getPublicPlans();
    expect(plans[0].maxBrands).toBeNull();
  });

  it("sin pasarela ePayco habilitada no se publica ningún plan", async () => {
    seedAllPlans([]); // ninguna pasarela habilitada => sin precio activo
    const plans = await getPublicPlans();
    expect(plans).toHaveLength(0);
  });
});
