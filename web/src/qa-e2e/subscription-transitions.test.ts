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

describe("D-6 · notificación de billing al administrador", () => {
  function seedWithAdmin(subscriptions: Array<Record<string, unknown>>) {
    H.current = createFakeSupabase({
      // El índice único de la migración 010 es lo que garantiza «una sola vez
      // por transición»; sin él la prueba no probaría nada.
      uniqueIndexes: { billing_outbox_jobs: [["idempotency_key"]] },
      tables: {
        subscriptions,
        subscription_events: [],
        billing_outbox_jobs: [],
        agents: [
          { id: "u1", organization_id: "o1", role: "admin", email: "admin@example.invalid", created_at: "2026-01-01" },
        ],
      },
    });
  }

  const jobs = () => H.current!.store.billing_outbox_jobs as Array<Record<string, unknown>>;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.BILLING_GRACE_DAYS = "3";
  });

  it("avisa al entrar en período de gracia (active -> past_due)", async () => {
    seedWithAdmin([
      { id: "s1", organization_id: "o1", status: "active", current_period_end: past(), cancel_at_period_end: false },
    ]);

    const body = await (await billingLifecycle(authedCron())).json();
    expect(body.graceNotifications).toBe(1);

    expect(jobs()).toHaveLength(1);
    expect(jobs()[0]).toMatchObject({
      job_type: "send_notification",
      organization_id: "o1",
      subscription_id: "s1",
    });
    expect(String(jobs()[0].idempotency_key)).toMatch(/^lifecycle-grace:s1:/);
    const request = (jobs()[0].payload as { request: { recipients: { email: string }; variables: { subject: string } } }).request;
    expect(request.recipients.email).toBe("admin@example.invalid");
    expect(request.variables.subject).toMatch(/gracia/i);
  });

  it("avisa al pasar a suspendida (past_due -> suspended)", async () => {
    seedWithAdmin([
      { id: "s2", organization_id: "o1", status: "past_due", grace_ends_at: past() },
    ]);

    const body = await (await billingLifecycle(authedCron())).json();
    expect(body.suspensionNotifications).toBe(1);
    expect(String(jobs()[0].idempotency_key)).toMatch(/^lifecycle-suspended:s2:/);
    const request = (jobs()[0].payload as { request: { variables: { subject: string } } }).request;
    expect(request.variables.subject).toMatch(/suspendida/i);
  });

  it("una sola vez por transición: la segunda corrida no vuelve a avisar", async () => {
    seedWithAdmin([
      { id: "s3", organization_id: "o1", status: "past_due", grace_ends_at: past() },
    ]);

    await billingLifecycle(authedCron());
    expect(jobs()).toHaveLength(1);

    // Se revive el estado para forzar la misma transición otra vez: la clave de
    // idempotencia es idéntica, así que el índice único rechaza el duplicado.
    subs()[0].status = "past_due";
    const second = await (await billingLifecycle(authedCron())).json();

    expect(second.suspensionNotifications).toBe(0);
    expect(jobs()).toHaveLength(1);
  });

  it("no avisa al cancelar por baja programada (D-6 sólo cubre gracia y suspensión)", async () => {
    seedWithAdmin([
      { id: "s4", organization_id: "o1", status: "active", current_period_end: past(), cancel_at_period_end: true },
    ]);

    const body = await (await billingLifecycle(authedCron())).json();
    expect(body.cancelled).toBe(1);
    expect(body.graceNotifications).toBe(0);
    expect(jobs()).toHaveLength(0);
  });

  it("sin administrador con correo no se encola nada y el cron no falla", async () => {
    H.current = createFakeSupabase({
      tables: {
        subscriptions: [
          { id: "s5", organization_id: "o1", status: "past_due", grace_ends_at: past() },
        ],
        subscription_events: [],
        billing_outbox_jobs: [],
        agents: [],
      },
    });

    const res = await billingLifecycle(authedCron());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suspended).toBe(1);
    expect(body.suspensionNotifications).toBe(0);
    expect(H.current!.store.billing_outbox_jobs).toHaveLength(0);
  });

  it("un ciclo posterior con otra gracia sí genera un aviso nuevo", async () => {
    seedWithAdmin([
      { id: "s6", organization_id: "o1", status: "past_due", grace_ends_at: past(1) },
    ]);
    await billingLifecycle(authedCron());
    expect(jobs()).toHaveLength(1);

    // Nuevo ciclo: la suscripción volvió a vencer con otra fecha de gracia.
    subs()[0].status = "past_due";
    subs()[0].grace_ends_at = past(2);
    await billingLifecycle(authedCron());

    expect(jobs()).toHaveLength(2);
    expect(new Set(jobs().map((job) => job.idempotency_key)).size).toBe(2);
  });
});

describe("D-5 / H-12 · downgrade programado aplicado por el cron", () => {
  const events = () => H.current!.store.subscription_events as Array<Record<string, unknown>>;
  const orgs = () => H.current!.store.organizations as Array<Record<string, unknown>>;

  function seedPending(overrides: Record<string, unknown> = {}) {
    H.current = createFakeSupabase({
      tables: {
        subscriptions: [
          {
            id: "s-down",
            organization_id: "o1",
            status: "active",
            plan_id: "plan-caro",
            plan_price_id: "price-caro",
            current_period_end: future(20),
            cancel_at_period_end: false,
            pending_plan_id: "plan-barato",
            pending_plan_price_id: "price-barato",
            change_effective_at: past(),
            ...overrides,
          },
        ],
        organizations: [{ id: "o1", plan_id: "plan-caro" }],
        subscription_events: [],
        billing_outbox_jobs: [],
        agents: [],
      },
    });
  }

  const sub = () => subs().find((s) => s.id === "s-down")!;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    process.env.BILLING_GRACE_DAYS = "3";
  });

  it("aplica el plan pendiente cuando llega change_effective_at", async () => {
    seedPending();
    const body = await (await billingLifecycle(authedCron())).json();

    expect(body.planChangesApplied).toBe(1);
    expect(sub().plan_id).toBe("plan-barato");
    expect(sub().plan_price_id).toBe("price-barato");
    expect(sub().status_reason).toBe("plan_change_applied");
  });

  it("limpia las tres columnas pendientes al aplicarlo", async () => {
    seedPending();
    await billingLifecycle(authedCron());

    expect(sub().pending_plan_id).toBeNull();
    expect(sub().pending_plan_price_id).toBeNull();
    expect(sub().change_effective_at).toBeNull();
  });

  it("la organización sigue al plan sólo cuando el cambio se hace efectivo", async () => {
    seedPending();
    expect(orgs()[0].plan_id).toBe("plan-caro");

    await billingLifecycle(authedCron());
    expect(orgs()[0].plan_id).toBe("plan-barato");
  });

  it("NO aplica el cambio antes de la fecha: el acceso actual se conserva", async () => {
    seedPending({ change_effective_at: future(5) });
    const body = await (await billingLifecycle(authedCron())).json();

    expect(body.planChangesApplied).toBe(0);
    expect(sub().plan_id).toBe("plan-caro");
    expect(sub().pending_plan_id).toBe("plan-barato");
    expect(orgs()[0].plan_id).toBe("plan-caro");
  });

  it("no toca suscripciones sin cambio pendiente", async () => {
    seedPending({ pending_plan_id: null, pending_plan_price_id: null, change_effective_at: null });
    const body = await (await billingLifecycle(authedCron())).json();

    expect(body.planChangesApplied).toBe(0);
    expect(sub().plan_id).toBe("plan-caro");
  });

  it("registra subscription_events con el plan de origen y el de destino", async () => {
    seedPending();
    await billingLifecycle(authedCron());

    const applied = events().find((event) => event.reason === "plan_change_applied");
    expect(applied).toBeTruthy();
    expect(applied).toMatchObject({
      subscription_id: "s-down",
      organization_id: "o1",
      actor_type: "system",
      previous_status: "active",
      new_status: "active",
    });
    expect(applied!.metadata).toMatchObject({
      from_plan_id: "plan-caro",
      to_plan_id: "plan-barato",
    });
    expect(String(applied!.correlation_id)).toMatch(/^plan-change:s-down:/);
  });

  it("es idempotente: una segunda corrida no reaplica ni duplica el evento", async () => {
    seedPending();
    await billingLifecycle(authedCron());
    const body = await (await billingLifecycle(authedCron())).json();

    expect(body.planChangesApplied).toBe(0);
    expect(events().filter((event) => event.reason === "plan_change_applied")).toHaveLength(1);
    expect(sub().plan_id).toBe("plan-barato");
  });

  it("un downgrade programado no interfiere con el vencimiento del período", async () => {
    // La suscripción tiene el cambio pendiente Y el período ya vencido: debe
    // pasar a past_due y además aplicar el plan pendiente.
    seedPending({ current_period_end: past(), change_effective_at: past() });

    const body = await (await billingLifecycle(authedCron())).json();

    expect(body.movedToPastDue).toBe(1);
    expect(body.planChangesApplied).toBe(1);
    expect(sub().status).toBe("past_due");
    expect(sub().plan_id).toBe("plan-barato");
  });

  it("aplica varios cambios pendientes en la misma corrida", async () => {
    seedPending();
    subs().push({
      id: "s-down-2",
      organization_id: "o2",
      status: "active",
      plan_id: "plan-caro",
      plan_price_id: "price-caro",
      current_period_end: future(20),
      cancel_at_period_end: false,
      pending_plan_id: "plan-mini",
      pending_plan_price_id: "price-mini",
      change_effective_at: past(),
    });
    orgs().push({ id: "o2", plan_id: "plan-caro" });

    const body = await (await billingLifecycle(authedCron())).json();

    expect(body.planChangesApplied).toBe(2);
    expect(subs().find((s) => s.id === "s-down-2")!.plan_id).toBe("plan-mini");
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
