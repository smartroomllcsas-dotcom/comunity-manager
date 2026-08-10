// E2E QA · Cancelación programada y reversión desde la cuenta del cliente.
// Ejercita las RUTAS REALES POST /api/billing/cancel y POST /api/billing/resume
// contra el Supabase en memoria. Cubre permisos, validación de organización,
// idempotencia, transiciones inválidas y registro en subscription_events.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";
import { subscriptionRow } from "./helpers/fixtures";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { POST as cancel } from "@/app/api/billing/cancel/route";
import { POST as resume } from "@/app/api/billing/resume/route";

const future = () => new Date(Date.now() + 30 * 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

const AGENT_ADMIN = {
  id: "user-admin",
  organization_id: "org-qa",
  role: "admin",
};

type Seeded = {
  agents?: Record<string, unknown>[];
  subscriptions?: Record<string, unknown>[];
  currentUserId?: string;
};

function seed({ agents = [AGENT_ADMIN], subscriptions = [], currentUserId = "user-admin" }: Seeded) {
  H.current = createFakeSupabase({
    currentUserId,
    tables: { agents, subscriptions, subscription_events: [] },
  });
}

const events = () => H.current!.store.subscription_events as Array<Record<string, unknown>>;
const subs = () => H.current!.store.subscriptions as Array<Record<string, unknown>>;

describe("POST /api/billing/cancel · permisos y validación", () => {
  it("401 si no hay sesión", async () => {
    H.current = createFakeSupabase({ tables: { agents: [], subscriptions: [] } });
    H.current.server.auth.getUser = async () => ({ data: { user: null } });
    const res = await cancel();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHENTICATED");
  });

  it("404 si el usuario autenticado no es un agente con organización", async () => {
    seed({ agents: [], subscriptions: [] });
    const res = await cancel();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("AGENT_NOT_FOUND");
  });

  it("403 si el agente no es administrador", async () => {
    seed({
      agents: [{ id: "user-admin", organization_id: "org-qa", role: "agent" }],
      subscriptions: [subscriptionRow({ current_period_end: future() })],
    });
    const res = await cancel();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN_ROLE");
    expect(events()).toHaveLength(0);
  });

  it("404 si la organización del agente no tiene suscripción cancelable", async () => {
    seed({ subscriptions: [subscriptionRow({ status: "suspended" })] });
    const res = await cancel();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  it("no alcanza la suscripción de otra organización", async () => {
    // La suscripción existe pero pertenece a otra organización: la ruta resuelve
    // el ámbito desde `agents`, nunca desde la petición.
    seed({
      subscriptions: [
        subscriptionRow({ id: "sub-ajena", organization_id: "org-otra", current_period_end: future() }),
      ],
    });
    const res = await cancel();
    expect(res.status).toBe(404);
    expect(subs()[0].cancel_at_period_end).toBe(false);
  });
});

describe("POST /api/billing/cancel · programación de la baja", () => {
  beforeEach(() => {
    seed({ subscriptions: [subscriptionRow({ status: "active", current_period_end: future() })] });
  });

  it("marca cancel_at_period_end sin cambiar el estado ni el período", async () => {
    const periodEnd = subs()[0].current_period_end;
    const res = await cancel();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({ ok: true, alreadyScheduled: false, accessEndsAt: periodEnd });

    // El acceso continúa: ni el estado ni el período se tocan.
    expect(subs()[0].status).toBe("active");
    expect(subs()[0].current_period_end).toBe(periodEnd);
    expect(subs()[0].cancel_at_period_end).toBe(true);
  });

  it("registra subscription_events con actor_type=user y el actor real", async () => {
    await cancel();
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      subscription_id: "sub-qa",
      organization_id: "org-qa",
      previous_status: "active",
      new_status: "active",
      reason: "cancel_scheduled_by_user",
      actor_type: "user",
      actor_id: "user-admin",
    });
  });

  it("es idempotente: la segunda llamada no duplica el evento", async () => {
    await cancel();
    const res = await cancel();
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyScheduled).toBe(true);
    expect(events()).toHaveLength(1);
    expect(subs()[0].cancel_at_period_end).toBe(true);
  });
});

describe("POST /api/billing/cancel · transiciones inválidas", () => {
  it("409 si el período facturado ya venció", async () => {
    seed({ subscriptions: [subscriptionRow({ status: "active", current_period_end: past() })] });
    const res = await cancel();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SUBSCRIPTION_PERIOD_ENDED");
    expect(subs()[0].cancel_at_period_end).toBe(false);
    expect(events()).toHaveLength(0);
  });

  it.each(["past_due", "suspended", "cancelled"])(
    "no ofrece cancelación programada en estado %s",
    async (status) => {
      seed({ subscriptions: [subscriptionRow({ status })] });
      const res = await cancel();
      expect(res.status).toBe(404); // el estado no entra en la búsqueda de cancelables
      expect(events()).toHaveLength(0);
    },
  );

  it("permite cancelar un trial vigente", async () => {
    seed({
      subscriptions: [
        subscriptionRow({ status: "trial", trial_ends_at: future(), current_period_end: future() }),
      ],
    });
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(subs()[0].status).toBe("trial");
    expect(subs()[0].cancel_at_period_end).toBe(true);
  });
});

describe("POST /api/billing/resume · deshacer la baja programada", () => {
  it("revierte cancel_at_period_end y registra el evento", async () => {
    seed({
      subscriptions: [
        subscriptionRow({ status: "active", current_period_end: future(), cancel_at_period_end: true }),
      ],
    });
    const res = await resume();
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, alreadyActive: false });
    expect(subs()[0].cancel_at_period_end).toBe(false);
    expect(subs()[0].status).toBe("active");
    expect(events()[0]).toMatchObject({
      reason: "cancel_scheduled_reverted_by_user",
      actor_type: "user",
      actor_id: "user-admin",
    });
  });

  it("es idempotente cuando no había baja programada", async () => {
    seed({
      subscriptions: [
        subscriptionRow({ status: "active", current_period_end: future(), cancel_at_period_end: false }),
      ],
    });
    const res = await resume();
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyActive).toBe(true);
    expect(events()).toHaveLength(0);
  });

  it("403 para un agente sin rol admin", async () => {
    seed({
      agents: [{ id: "user-admin", organization_id: "org-qa", role: "agent" }],
      subscriptions: [
        subscriptionRow({ current_period_end: future(), cancel_at_period_end: true }),
      ],
    });
    const res = await resume();
    expect(res.status).toBe(403);
    expect(subs()[0].cancel_at_period_end).toBe(true);
  });

  it("no reactiva una suscripción suspendida", async () => {
    seed({ subscriptions: [subscriptionRow({ status: "suspended", cancel_at_period_end: true })] });
    const res = await resume();
    expect(res.status).toBe(404);
    expect(subs()[0].status).toBe("suspended");
    expect(events()).toHaveLength(0);
  });
});

describe("Ciclo completo cancelar → mantener → cancelar", () => {
  it("deja exactamente un evento por acción efectiva", async () => {
    seed({ subscriptions: [subscriptionRow({ status: "active", current_period_end: future() })] });

    await cancel();
    await cancel(); // idempotente
    await resume();
    await resume(); // idempotente
    await cancel();

    expect(events().map((event) => event.reason)).toEqual([
      "cancel_scheduled_by_user",
      "cancel_scheduled_reverted_by_user",
      "cancel_scheduled_by_user",
    ]);
    expect(subs()[0].cancel_at_period_end).toBe(true);
    expect(subs()[0].status).toBe("active");
  });
});
