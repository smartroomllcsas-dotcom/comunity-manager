// E2E QA · Requisito 4: aislamiento entre Marca A y Marca B.
// Valida el scoping por marca a nivel aplicación (brand-scope): un asesor
// asignado sólo a Marca A no puede ver marcas ni conversaciones de Marca B; el
// superadmin mantiene acceso global.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import {
  isBrandScopedMember, getAgentBrandIds, agentCanAccessBrand, getAccessibleConversation,
} from "@/lib/smarttalk/brand-scope";

const ORG = "org-qa";
const advisorA = { id: "advisor-a", organization_id: ORG, member_type: "brand_advisor", is_super_admin: false };
const superAdmin = { id: "super", organization_id: ORG, member_type: "agency_admin", is_super_admin: true };

beforeEach(() => {
  H.current = createFakeSupabase({
    tables: {
      cm_clients: [
        { id: "brand-a", name: "Marca A", smarttalk_organization_id: ORG },
        { id: "brand-b", name: "Marca B", smarttalk_organization_id: ORG },
      ],
      brand_advisor_assignments: [
        { organization_id: ORG, agent_id: "advisor-a", brand_id: "brand-a" },
      ],
      conversations: [
        { id: "conv-a", organization_id: ORG, brand_id: "brand-a", contact: { visibility_status: "active" } },
        { id: "conv-b", organization_id: ORG, brand_id: "brand-b", contact: { visibility_status: "active" } },
      ],
    },
  });
});

describe("E2E QA · Aislamiento Marca A vs Marca B", () => {
  it("el asesor sólo tiene asignada Marca A", async () => {
    expect(isBrandScopedMember(advisorA)).toBe(true);
    expect(await getAgentBrandIds(advisorA)).toEqual(["brand-a"]);
  });

  it("el asesor puede acceder a Marca A pero NO a Marca B", async () => {
    expect(await agentCanAccessBrand(advisorA, "brand-a")).toBe(true);
    expect(await agentCanAccessBrand(advisorA, "brand-b")).toBe(false);
  });

  it("el asesor ve la conversación de Marca A y NO la de Marca B", async () => {
    const a = await getAccessibleConversation(advisorA, "conv-a");
    const b = await getAccessibleConversation(advisorA, "conv-b");
    expect(a).not.toBeNull();
    expect((a as { brand_id: string }).brand_id).toBe("brand-a");
    expect(b).toBeNull(); // Marca B fuera de alcance
  });

  it("el superadmin tiene alcance global (sin filtro de marca)", async () => {
    expect(await getAgentBrandIds(superAdmin)).toBeNull();
    expect(await agentCanAccessBrand(superAdmin, "brand-b")).toBe(true);
    const b = await getAccessibleConversation(superAdmin, "conv-b");
    expect(b).not.toBeNull();
    expect((b as { brand_id: string }).brand_id).toBe("brand-b");
  });
});
