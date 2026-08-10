// E2E QA · Endurecimiento del ciclo de vida.
// Cubre lo que la suite previa no ejercitaba: ejecución repetida del cron,
// lote grande de suscripciones vencidas, y las transiciones manuales de
// super admin (PATCH /api/admin/subscriptions), incluida la prohibición de
// activar sin pago aprobado.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { GET as billingLifecycle } from "@/app/api/cron/billing-lifecycle/route";
import { PATCH as adminPatch } from "@/app/api/admin/subscriptions/route";

const SECRET = "qa-cron-secret";
const future = (days = 10) => new Date(Date.now() + days * 86_400_000).toISOString();
const past = (days = 1) => new Date(Date.now() - days * 86_400_000).toISOString();

const authedCron = () =>
  ({
    headers: { get: (h: string) => (h === "authorization" ? `Bearer ${SECRET}` : null) },
  }) as unknown as Parameters<typeof billingLifecycle>[0];

const subs = () => H.current!.store.subscriptions as Array<Record<string, unknown>>;
const events = () => H.current!.store.subscription_events as Array<Record<string, unknown>>;

describe("Cron de ciclo de vida · ejecución repetida", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.BILLING_GRACE_DAYS = "3";
    H.current = createFakeSupabase({
      tables: {
        subscriptions: [
          { id: "s-vence", organization_id: "o1", status: "active", current_period_end: past(), cancel_at_period_end: false, grace_ends_at: null },
          { id: "s-baja", organization_id: "o1", status: "active", current_period_end: past(), cancel_at_period_end: true, grace_ends_at: null },
          { id: "s-gracia", organization_id: "o1", status: "past_due", grace_ends_at: past() },
        ],
        subscription_events: [],
      },
    });
  });

  it("la segunda corrida no vuelve a transicionar ni duplica eventos", async () => {
    const first = await (await billingLifecycle(authedCron())).json();
    expect(first).toMatchObject({ movedToPastDue: 1, cancelled: 1, suspended: 1 });
    const eventsAfterFirst = events().length;
    expect(eventsAfterFirst).toBe(3);

    const second = await (await billingLifecycle(authedCron())).json();
    // s-vence pasó a past_due con grace_ends_at futuro, así que tampoco entra
    // en la segunda pasada por gracia.
    expect(second).toMatchObject({ movedToPastDue: 0, cancelled: 0, suspended: 0 });
    expect(events()).toHaveLength(eventsAfterFirst);
  });

  it("la suscripción recién movida a past_due conserva su ventana de gracia", async () => {
    await billingLifecycle(authedCron());
    const moved = subs().find((s) => s.id === "s-vence")!;
    expect(moved.status).toBe("past_due");
    expect(new Date(moved.grace_ends_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(moved.status_reason).toBe("period_ended_without_renewal");
  });

  it("la cancelación programada se materializa como cancelled con su motivo", async () => {
    await billingLifecycle(authedCron());
    const cancelled = subs().find((s) => s.id === "s-baja")!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.status_reason).toBe("cancel_at_period_end");
    expect(cancelled.grace_ends_at).toBeNull();
    expect(cancelled.cancelled_at).toBeTruthy();
  });
});

describe("Cron de ciclo de vida · lote de suscripciones vencidas", () => {
  const BATCH = 250;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.BILLING_GRACE_DAYS = "3";
    H.current = createFakeSupabase({
      tables: {
        subscriptions: [
          ...Array.from({ length: BATCH }, (_, i) => ({
            id: `s-lote-${i}`,
            organization_id: `org-${i % 7}`,
            status: "active",
            current_period_end: past(2),
            cancel_at_period_end: i % 5 === 0,
            grace_ends_at: null,
          })),
          { id: "s-vigente", organization_id: "org-x", status: "active", current_period_end: future(), cancel_at_period_end: false },
        ],
        subscription_events: [],
      },
    });
  });

  it("procesa el lote completo sin dejar filas a medias", async () => {
    const body = await (await billingLifecycle(authedCron())).json();
    const expectedCancelled = Math.ceil(BATCH / 5); // i % 5 === 0
    expect(body.cancelled).toBe(expectedCancelled);
    expect(body.movedToPastDue).toBe(BATCH - expectedCancelled);

    const pending = subs().filter(
      (s) => s.status === "active" && new Date(s.current_period_end as string).getTime() < Date.now(),
    );
    expect(pending).toHaveLength(0);
    expect(events()).toHaveLength(BATCH);
  });

  it("no toca las suscripciones con período vigente", async () => {
    await billingLifecycle(authedCron());
    expect(subs().find((s) => s.id === "s-vigente")!.status).toBe("active");
  });
});

describe("PATCH /api/admin/subscriptions · transiciones manuales", () => {
  function seedAdmin(subscription: Record<string, unknown>, superAdmin = true) {
    H.current = createFakeSupabase({
      currentUserId: "user-super",
      tables: {
        agents: [{ id: "user-super", is_super_admin: superAdmin }],
        subscriptions: [subscription],
        subscription_events: [],
      },
    });
  }

  const patch = (body: unknown) =>
    adminPatch({ json: async () => body } as unknown as Request);

  it("403 si el usuario no es super admin", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "active" }, false);
    expect((await patch({ id: "s1", status: "cancelled" })).status).toBe(403);
  });

  it("409 al intentar activar sin pago aprobado", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "suspended" });
    const res = await patch({ id: "s1", status: "active" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("REACTIVATION_REQUIRES_PAYMENT");
    expect(subs()[0].status).toBe("suspended");
    expect(events()).toHaveLength(0);
  });

  it("409 al intentar devolver una cancelada a trial", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "cancelled" });
    const res = await patch({ id: "s1", status: "trial" });
    expect(res.status).toBe(409);
    expect(subs()[0].status).toBe("cancelled");
  });

  it("409 en una transición fuera del grafo permitido", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "cancelled" });
    const res = await patch({ id: "s1", status: "suspended" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_TRANSITION");
  });

  it("permite suspender una suscripción vencida y registra el evento como admin", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "past_due" });
    const res = await patch({ id: "s1", status: "suspended", reason: "fraude_confirmado" });
    expect(res.status).toBe(200);
    expect(subs()[0].status).toBe("suspended");
    expect(subs()[0].suspended_at).toBeTruthy();
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      previous_status: "past_due",
      new_status: "suspended",
      reason: "fraude_confirmado",
      actor_type: "admin",
      actor_id: "user-super",
    });
  });

  it("es idempotente cuando el estado solicitado ya es el actual", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "suspended" });
    const res = await patch({ id: "s1", status: "suspended" });
    expect(res.status).toBe(200);
    expect((await res.json()).unchanged).toBe(true);
    expect(events()).toHaveLength(0);
  });

  it("404 si la suscripción no existe", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "active" });
    expect((await patch({ id: "no-existe", status: "cancelled" })).status).toBe(404);
  });

  it("400 con un estado desconocido", async () => {
    seedAdmin({ id: "s1", organization_id: "o1", status: "active" });
    expect((await patch({ id: "s1", status: "zombi" })).status).toBe(400);
  });
});
