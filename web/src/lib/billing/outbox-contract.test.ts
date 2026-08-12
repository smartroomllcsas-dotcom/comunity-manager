// Contrato observable del worker de outbox.
//
// Determinación del 2026-08-10: de los seis tipos del CHECK de la migración
// 010, **sólo `send_notification` tiene handler**. Los otros cinco se retiraron
// de `BillingOutboxJobType` para que ningún código pueda encolarlos, y quedan
// listados en `UNIMPLEMENTED_OUTBOX_JOB_TYPES` con su motivo.
//
// Estas pruebas NO inventan la lógica ausente: congelan el comportamiento real
// (fallo controlado -> reintentos -> dead_letter) para que implementarlos
// obligue a actualizar este archivo de forma consciente.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  claimed: [] as Array<Record<string, unknown>>,
  completed: [] as unknown[],
  retries: [] as Array<Record<string, unknown>>,
  retryStatus: "retry" as "retry" | "dead_letter",
  notifyCalls: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_billing_outbox_jobs") return { data: state.claimed, error: null };
      if (name === "complete_billing_outbox_job") {
        state.completed.push(args.p_job_id);
        return { data: true, error: null };
      }
      if (name === "retry_billing_outbox_job") {
        state.retries.push(args);
        return { data: state.retryStatus, error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

vi.mock("@/lib/notify/dispatcher", () => ({
  notify: async () => {
    state.notifyCalls += 1;
    return { results: [{ channel: "email", ok: true, id: "msg-1" }] };
  },
}));

import { UNIMPLEMENTED_OUTBOX_JOB_TYPES, processBillingOutboxJobs } from "./outbox";

const UNHANDLED_TYPES = UNIMPLEMENTED_OUTBOX_JOB_TYPES;

beforeEach(() => {
  state.claimed = [];
  state.completed = [];
  state.retries = [];
  state.retryStatus = "retry";
  state.notifyCalls = 0;
});

describe("Outbox · determinación sobre los tipos sin handler", () => {
  it("los cinco tipos sin implementar están enumerados y son los del CHECK de la migración 010", () => {
    expect([...UNIMPLEMENTED_OUTBOX_JOB_TYPES].sort()).toEqual([
      "apply_plan_change",
      "expire_subscription",
      "process_webhook",
      "reconcile_payment",
      "renew_subscription",
    ]);
  });

  it("`process_webhook` también carece de handler, aunque no figuraba en el encargo", async () => {
    state.claimed = [
      { id: "job-pw", job_type: "process_webhook", organization_id: "org-1", payload: {}, attempt_count: 0 },
    ];
    const result = await processBillingOutboxJobs();
    expect(result).toMatchObject({ claimed: 1, completed: 0, retried: 1 });
  });
});

describe("Outbox · tipos declarados sin handler", () => {
  it.each(UNHANDLED_TYPES)(
    "'%s' no se completa: se envía a reintento con handler_failed",
    async (jobType) => {
      state.claimed = [
        { id: `job-${jobType}`, job_type: jobType, organization_id: "org-1", payload: {}, attempt_count: 0 },
      ];

      const result = await processBillingOutboxJobs();

      expect(result).toMatchObject({ claimed: 1, completed: 0, retried: 1, deadLettered: 0 });
      expect(state.completed).toHaveLength(0);
      expect(state.retries).toHaveLength(1);
      expect(state.retries[0]).toMatchObject({
        p_job_id: `job-${jobType}`,
        p_error_code: "handler_failed",
        p_max_attempts: 5,
      });
      // El mensaje deja explícito que falta el handler, no que el job sea inválido.
      expect(String(state.retries[0].p_error_message)).toContain(
        `No handler registered for billing job type '${jobType}'`,
      );
    },
  );

  it.each(UNHANDLED_TYPES)(
    "'%s' termina en dead_letter cuando se agotan los intentos",
    async (jobType) => {
      state.retryStatus = "dead_letter";
      state.claimed = [
        { id: `job-${jobType}`, job_type: jobType, organization_id: "org-1", payload: {}, attempt_count: 5 },
      ];

      const result = await processBillingOutboxJobs();

      expect(result).toMatchObject({ claimed: 1, completed: 0, retried: 0, deadLettered: 1 });
    },
  );

  it("un tipo desconocido que no está ni declarado se comporta igual", async () => {
    state.claimed = [
      { id: "job-x", job_type: "tipo_inexistente", organization_id: null, payload: {}, attempt_count: 0 },
    ];
    const result = await processBillingOutboxJobs();
    expect(result).toMatchObject({ claimed: 1, completed: 0, retried: 1 });
  });

  it("un lote mixto no deja que un tipo sin handler bloquee a los demás", async () => {
    state.claimed = [
      { id: "job-sin-handler", job_type: "apply_plan_change", organization_id: "org-1", payload: {}, attempt_count: 0 },
      {
        id: "job-notif",
        job_type: "send_notification",
        organization_id: "org-1",
        attempt_count: 0,
        payload: { request: { organizationId: "org-1", channels: ["email"], template: "billing_alert" } },
      },
    ];

    const result = await processBillingOutboxJobs();

    expect(result).toMatchObject({ claimed: 2, completed: 1, retried: 1, deadLettered: 0 });
    expect(state.completed).toEqual(["job-notif"]);
    expect(state.notifyCalls).toBe(1);
  });
});

describe("Outbox · validación del único tipo implementado", () => {
  it("send_notification exige un payload.request con organización, canales y plantilla", async () => {
    state.claimed = [
      { id: "job-malo", job_type: "send_notification", organization_id: "org-1", payload: { request: {} }, attempt_count: 0 },
    ];

    const result = await processBillingOutboxJobs();

    expect(result).toMatchObject({ completed: 0, retried: 1 });
    expect(String(state.retries[0].p_error_message)).toContain("payload.request is invalid");
    expect(state.notifyCalls).toBe(0);
  });

  it("un payload sin request se rechaza antes de llamar al proveedor", async () => {
    state.claimed = [
      { id: "job-vacio", job_type: "send_notification", organization_id: "org-1", payload: {}, attempt_count: 0 },
    ];
    await processBillingOutboxJobs();
    expect(String(state.retries[0].p_error_message)).toContain("payload.request is required");
    expect(state.notifyCalls).toBe(0);
  });
});
