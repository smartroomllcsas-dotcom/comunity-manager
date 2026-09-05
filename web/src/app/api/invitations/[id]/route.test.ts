/**
 * Cancelar una invitación pendiente debe funcionar de verdad.
 *
 * Regresión del 2026-09-04: la ruta ponía status="cancelled", valor que el
 * enum invitation_status (pending/accepted/expired) no admite; la base lo
 * rechazaba y la invitación seguía pendiente sin que la UI avisara.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeSupabase } from "@/qa-e2e/helpers/fake-supabase";
import { createFakeSupabase } from "@/qa-e2e/helpers/fake-supabase";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => H.current!.admin(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => H.current!.server,
}));

import { DELETE } from "./route";

const ORG = "org-1";
const ADMIN_ID = "agent-admin";
const INVALID_STATUSES = ["cancelled", "canceled", "revoked"];

function setup(invitationStatus: "pending" | "accepted") {
  H.current = createFakeSupabase({
    currentUserId: ADMIN_ID,
    tables: {
      agents: [
        {
          id: ADMIN_ID,
          organization_id: ORG,
          role: "admin",
          member_type: "agency_user",
          is_super_admin: true,
        },
      ],
      invitations: [
        {
          id: "inv-1",
          organization_id: ORG,
          email: "smartroomllcsa@gmail.com",
          role: "agent",
          member_type: "brand_advisor",
          status: invitationStatus,
        },
      ],
      invitation_brand_assignments: [],
    },
  });
}

function call(id: string) {
  const request = new Request(`http://localhost/api/invitations/${id}`, { method: "DELETE" });
  // La ruta sólo usa `params`; el request no se lee.
  return DELETE(request as never, { params: Promise.resolve({ id }) });
}

describe("DELETE /api/invitations/[id]", () => {
  beforeEach(() => {
    H.current = null;
  });

  it("elimina la invitación pendiente en vez de marcarla con un estado inválido", async () => {
    setup("pending");
    const res = await call("inv-1");
    expect(res.status).toBe(200);

    const rows = H.current!.store.invitations || [];
    expect(rows.find((r) => r.id === "inv-1")).toBeUndefined();
    // Nunca debe quedar una fila con un valor que el enum de la base rechaza.
    expect(rows.some((r) => INVALID_STATUSES.includes(String(r.status)))).toBe(false);
  });

  it("no cancela una invitación ya aceptada", async () => {
    setup("accepted");
    const res = await call("inv-1");
    expect(res.status).toBe(409);
    expect(H.current!.store.invitations.find((r) => r.id === "inv-1")).toBeDefined();
  });

  it("responde 404 si la invitación no existe", async () => {
    setup("pending");
    const res = await call("inv-nope");
    expect(res.status).toBe(404);
  });
});
