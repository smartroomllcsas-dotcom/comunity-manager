// E2E QA · Recuperación de webhooks fallidos — decisiones D-1 y D-2.
//
//   D-1 · Sólo se reprocesa `signature_valid = true`. Una firma inválida NUNCA
//         se reprocesa. Toda recuperación queda auditada.
//   D-2 · Los tres conflictos de datos notifican al administrador y crean
//         alerta de revisión, SIN bloquear la cuenta.
//
// Ejercita la ruta real del cron y el módulo de recuperación contra el Supabase
// en memoria. No se contacta ningún proveedor.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeSupabase, Seed } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { GET as recoveryCron } from "@/app/api/cron/billing-webhook-recovery/route";
import {
  PERMANENT_ERRORS,
  RECOVERABLE_ERRORS,
  REVIEW_REQUIRED_ERRORS,
  classifyWebhookFailure,
  recoverFailedWebhookEvents,
} from "@/lib/billing/webhook-recovery";

const SECRET = "qa-cron-secret";
const future = () => new Date(Date.now() + 3_600_000).toISOString();

const authedRequest = () =>
  ({
    headers: { get: (h: string) => (h === "authorization" ? `Bearer ${SECRET}` : null) },
  }) as unknown as Parameters<typeof recoveryCron>[0];

function payload(overrides: Record<string, string> = {}) {
  return {
    x_cust_id_cliente: "qa-cust",
    x_ref_payco: "REF-1",
    x_transaction_id: "TXN-1",
    x_amount: "59000.00",
    x_currency_code: "COP",
    x_cod_response: "1",
    x_response: "1",
    x_extra1: "cs-1",
    x_extra2: "INV-1",
    x_id_invoice: "INV-1",
    x_test_request: "true",
    ...overrides,
  };
}

function seed(
  events: Array<Record<string, unknown>>,
  options: {
    checkoutStatus?: string;
    errorOn?: Seed["errorOn"];
    /** Hace fallar el RPC de activación conservando el checkout, para provocar
     *  un `atomic_activation_failed` reprocesable con organización resoluble. */
    failRpc?: { times: number };
  } = {},
) {
  const rpcFailures = { remaining: options.failRpc?.times ?? 0 };
  H.current = createFakeSupabase({
    uniqueIndexes: { billing_outbox_jobs: [["idempotency_key"]] },
    errorOn: options.errorOn,
    rpcHandlers: {
      finalize_epayco_approved_payment: (args, store) => {
        if (rpcFailures.remaining > 0) {
          rpcFailures.remaining -= 1;
          throw new Error("deadlock detected");
        }
        const { p_checkout_session_id } = args as { p_checkout_session_id: string };
        const session = (store.checkout_sessions || []).find((row) => row.id === p_checkout_session_id);
        if (!session) throw new Error("checkout_session_not_found");
        if (session.status !== "pending") throw new Error("checkout_not_pending");
        session.status = "approved";
        return "sub-1";
      },
    },
    tables: {
      billing_webhook_events: events,
      checkout_sessions: [
        {
          id: "cs-1", internal_reference: "INV-1", organization_id: "org-qa",
          plan_id: "plan-1", plan_price_id: "pp-1",
          status: options.checkoutStatus ?? "pending",
          amount_minor: 5_900_000, currency: "COP", test_mode: true,
          environment: "sandbox", purpose: "initial", expires_at: future(),
        },
      ],
      payments: [],
      agents: [{ id: "u1", organization_id: "org-qa", role: "admin", email: "admin@example.invalid", created_at: "2026-01-01" }],
      billing_outbox_jobs: [],
      billing_audit_events: [],
    },
  });
}

function failedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    provider: "epayco",
    environment: "sandbox",
    event_key: "TXN-1",
    signature_valid: true,
    status: "failed",
    last_error: "atomic_activation_failed",
    attempt_count: 0,
    next_attempt_at: null,
    locked_at: null,
    locked_by: null,
    payload: payload(),
    created_at: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
const behind = (ms: number) => new Date(Date.now() - ms).toISOString();

const events = () => H.current!.store.billing_webhook_events as Array<Record<string, unknown>>;
const jobs = () => H.current!.store.billing_outbox_jobs as Array<Record<string, unknown>>;
const auditRows = () => H.current!.store.billing_audit_events as Array<Record<string, unknown>>;

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

// ---------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------

describe("Clasificación de fallos", () => {
  it.each(RECOVERABLE_ERRORS)("%s => recoverable", (reason) => {
    expect(classifyWebhookFailure(reason)).toBe("recoverable");
  });

  it.each(REVIEW_REQUIRED_ERRORS)("%s => review_required (D-2)", (reason) => {
    expect(classifyWebhookFailure(reason)).toBe("review_required");
  });

  it.each(PERMANENT_ERRORS)("%s => permanent", (reason) => {
    expect(classifyWebhookFailure(reason)).toBe("permanent");
  });

  it("un motivo desconocido no se reprocesa a ciegas: cae en revisión humana", () => {
    expect(classifyWebhookFailure("motivo_nuevo_sin_clasificar")).toBe("unknown");
    expect(classifyWebhookFailure(null)).toBe("unknown");
  });

  it("las tres listas son disjuntas y cubren los siete motivos de la ruta", () => {
    const all = [...RECOVERABLE_ERRORS, ...REVIEW_REQUIRED_ERRORS, ...PERMANENT_ERRORS];
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(
      [
        "amount_or_currency_mismatch",
        "atomic_activation_failed",
        "checkout_session_not_found",
        "environment_mismatch",
        "existing_payment_mismatch",
        "payment_insert_failed",
        "reference_mismatch",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// D-1 · Firma
// ---------------------------------------------------------------------------

describe("D-1 · sólo se reprocesa con firma válida", () => {
  it("un evento con signature_valid=false NUNCA se selecciona", async () => {
    seed([failedEvent({ signature_valid: false })]);
    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.scanned).toBe(0);
    expect(outcome.recovered).toBe(0);
    expect(events()[0].status).toBe("failed");
    // Ni auditoría ni notificación: el evento no se toca en absoluto.
    expect(auditRows()).toHaveLength(0);
    expect(jobs()).toHaveLength(0);
  });

  it("con firma válida sí se reprocesa y queda `processed`", async () => {
    seed([failedEvent()]);
    const outcome = await recoverFailedWebhookEvents();

    expect(outcome).toMatchObject({ scanned: 1, recovered: 1, retried: 0, deadLettered: 0 });
    expect(events()[0].status).toBe("processed");
    expect(events()[0].last_error).toBeNull();
  });

  it("toda recuperación queda auditada con actor system y resultado", async () => {
    seed([failedEvent()]);
    await recoverFailedWebhookEvents();

    expect(auditRows()).toHaveLength(1);
    expect(auditRows()[0]).toMatchObject({
      organization_id: "org-qa",
      actor_type: "system",
      action: "webhook_recovery_processed",
      entity_type: "billing_webhook_event",
      entity_id: "ev-1",
      result: "success",
    });
    expect(auditRows()[0].correlation_id).toBeTruthy();
  });

  it("un reintento fallido también se audita", async () => {
    // El checkout no existe: settle devuelve checkout_session_not_found.
    seed([failedEvent()]);
    H.current!.store.checkout_sessions = [];

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome).toMatchObject({ retried: 1, recovered: 0 });
    expect(auditRows()[0]).toMatchObject({ action: "webhook_recovery_retry", result: "failed" });
    expect(events()[0].attempt_count).toBe(1);
    expect(events()[0].next_attempt_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// D-2 · Conflictos de datos
// ---------------------------------------------------------------------------

describe("D-2 · conflictos de datos notifican y no bloquean", () => {
  it.each(REVIEW_REQUIRED_ERRORS)(
    "%s: alerta al administrador y deja el evento para revisión",
    async (reason) => {
      seed([failedEvent({ last_error: reason })]);
      const outcome = await recoverFailedWebhookEvents();

      expect(outcome).toMatchObject({ flaggedForReview: 1, recovered: 0, retried: 0 });
      expect(events()[0].status).toBe("dead_letter");
      expect(events()[0].last_error_code).toBe("review_required");

      // Notificación encolada al administrador de la organización.
      expect(jobs()).toHaveLength(1);
      expect(jobs()[0]).toMatchObject({
        job_type: "send_notification",
        organization_id: "org-qa",
        webhook_event_id: "ev-1",
        idempotency_key: "webhook-review:ev-1",
      });
      const request = (jobs()[0].payload as { request: { recipients: { email: string } } }).request;
      expect(request.recipients.email).toBe("admin@example.invalid");

      // Auditado como denegado, no como éxito.
      expect(auditRows()[0]).toMatchObject({
        action: "webhook_recovery_review_required",
        result: "denied",
      });
    },
  );

  it("NO bloquea la cuenta: la organización y la suscripción quedan intactas", async () => {
    seed([failedEvent({ last_error: "amount_or_currency_mismatch" })]);
    H.current!.store.organizations = [{ id: "org-qa", is_active: true }];
    H.current!.store.subscriptions = [{ id: "sub-1", organization_id: "org-qa", status: "active" }];

    await recoverFailedWebhookEvents();

    expect((H.current!.store.organizations as Array<Record<string, unknown>>)[0].is_active).toBe(true);
    expect((H.current!.store.subscriptions as Array<Record<string, unknown>>)[0].status).toBe("active");
  });

  it("el mensaje al administrador dice explícitamente que no se bloqueó nada", async () => {
    seed([failedEvent({ last_error: "environment_mismatch" })]);
    await recoverFailedWebhookEvents();

    const request = (jobs()[0].payload as { request: { variables: { text: string } } }).request;
    expect(request.variables.text).toMatch(/no fue bloqueado|sigue activa/i);
  });

  it("no reprocesa el pago de un conflicto de datos", async () => {
    seed([failedEvent({ last_error: "existing_payment_mismatch" })]);
    await recoverFailedWebhookEvents();

    expect(H.current!.rpcCalls).toHaveLength(0);
    expect(H.current!.store.payments).toHaveLength(0);
  });

  it("un motivo desconocido se trata igual que un conflicto: revisión humana", async () => {
    seed([failedEvent({ last_error: "motivo_inedito" })]);
    const outcome = await recoverFailedWebhookEvents();
    expect(outcome.flaggedForReview).toBe(1);
    expect(events()[0].status).toBe("dead_letter");
  });

  it("reference_mismatch va a dead_letter SIN alertar (no está en los tres de D-2)", async () => {
    seed([failedEvent({ last_error: "reference_mismatch" })]);
    const outcome = await recoverFailedWebhookEvents();

    expect(outcome).toMatchObject({ deadLettered: 1, flaggedForReview: 0 });
    expect(events()[0].last_error_code).toBe("permanent_failure");
    expect(jobs()).toHaveLength(0);
    expect(auditRows()[0].action).toBe("webhook_recovery_permanent_failure");
  });
});

// ---------------------------------------------------------------------------
// Reintentos, agotamiento e idempotencia
// ---------------------------------------------------------------------------

describe("Reintentos y agotamiento", () => {
  it("un payload sin transacción no se reprocesa: dead_letter auditado", async () => {
    seed([failedEvent({ payload: { x_extra1: "cs-1" } })]);
    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.deadLettered).toBe(1);
    expect(events()[0].last_error_code).toBe("payload_incomplete");
    expect(H.current!.rpcCalls).toHaveLength(0);
  });

  it("reprocesar un evento cuyo checkout ya está aprobado no duplica activación", async () => {
    seed([failedEvent()], { checkoutStatus: "approved" });
    const outcome = await recoverFailedWebhookEvents();

    // settle devuelve `ignored` (checkout fuera de pending) y el evento se cierra.
    expect(outcome.recovered).toBe(1);
    expect(events()[0].status).toBe("processed");
    expect(H.current!.rpcCalls).toHaveLength(0);
    expect(H.current!.store.payments).toHaveLength(0);
  });

  it("dos pasadas del cron no duplican la alerta de revisión", async () => {
    seed([failedEvent({ last_error: "amount_or_currency_mismatch" })]);

    await recoverFailedWebhookEvents();
    // Segunda pasada: el evento ya es dead_letter, así que no se selecciona.
    const second = await recoverFailedWebhookEvents();

    expect(second.scanned).toBe(0);
    expect(jobs()).toHaveLength(1);
  });

  it("la clave de idempotencia impide una segunda alerta del mismo evento", async () => {
    seed([failedEvent({ id: "ev-dup", last_error: "amount_or_currency_mismatch" })]);
    await recoverFailedWebhookEvents();

    // Se revive el evento a mano para forzar una segunda selección.
    events()[0].status = "failed";
    events()[0].last_error_code = null;
    await recoverFailedWebhookEvents();

    // El índice único de billing_outbox_jobs.idempotency_key evita el duplicado.
    expect(jobs()).toHaveLength(1);
  });

  it("procesa un lote mixto sin que un evento detenga a los demás", async () => {
    seed([
      failedEvent({ id: "ev-ok", event_key: "TXN-OK" }),
      failedEvent({ id: "ev-review", last_error: "environment_mismatch" }),
      failedEvent({ id: "ev-perm", last_error: "reference_mismatch" }),
      failedEvent({ id: "ev-invalid", signature_valid: false }),
    ]);

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.scanned).toBe(3); // el de firma inválida no entra
    expect(outcome.recovered).toBe(1);
    expect(outcome.flaggedForReview).toBe(1);
    expect(outcome.deadLettered).toBe(1);
    expect(events().find((event) => event.id === "ev-invalid")!.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Selección: next_attempt_at y attempt_count
// ---------------------------------------------------------------------------

describe("Selección · turno y número de intentos", () => {
  it("un evento con next_attempt_at en el futuro NO se selecciona", async () => {
    seed([failedEvent({ next_attempt_at: ahead(600_000) })]);
    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.scanned).toBe(0);
    expect(outcome.claimed).toBe(0);
    expect(events()[0].status).toBe("failed");
    expect(H.current!.rpcCalls).toHaveLength(0);
    // Ni siquiera se reclama: el lease queda libre para cuando toque.
    expect(events()[0].locked_by).toBeNull();
  });

  it("un evento con next_attempt_at ya vencido sí se procesa", async () => {
    seed([failedEvent({ next_attempt_at: behind(1_000) })]);
    const outcome = await recoverFailedWebhookEvents();
    expect(outcome.recovered).toBe(1);
    expect(events()[0].status).toBe("processed");
  });

  it("un evento sin next_attempt_at es elegible de inmediato", async () => {
    seed([failedEvent({ next_attempt_at: null })]);
    expect((await recoverFailedWebhookEvents()).recovered).toBe(1);
  });

  it("un evento con attempt_count >= 5 NO se selecciona", async () => {
    seed([failedEvent({ attempt_count: 5 })]);
    const outcome = await recoverFailedWebhookEvents();
    expect(outcome.scanned).toBe(0);
    expect(events()[0].status).toBe("failed");
  });

  it("el reintento que alcanza el máximo pasa a dead_letter en la misma pasada", async () => {
    // attempt_count 4 -> el fallo lo lleva a 5, que es el máximo. El checkout
    // se conserva para que la organización sea resoluble y pueda alertarse.
    seed([failedEvent({ attempt_count: 4 })], { failRpc: { times: 1 } });

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome).toMatchObject({ deadLettered: 1, retried: 0 });
    expect(events()[0].status).toBe("dead_letter");
    expect(events()[0].attempt_count).toBe(5);
    expect(events()[0].last_error_code).toBe("max_attempts_reached");
    // Y alerta al administrador una sola vez.
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0].idempotency_key).toBe("webhook-dead-letter:ev-1");
  });

  it("un reintento por debajo del máximo agenda el siguiente turno con backoff", async () => {
    seed([failedEvent({ attempt_count: 1 })]);
    H.current!.store.checkout_sessions = [];

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.retried).toBe(1);
    expect(events()[0].attempt_count).toBe(2);
    expect(events()[0].status).toBe("failed");
    expect(new Date(events()[0].next_attempt_at as string).getTime()).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Lease y concurrencia
// ---------------------------------------------------------------------------

describe("Lease · concurrencia entre workers", () => {
  it("dos workers concurrentes: sólo uno procesa el evento", async () => {
    seed([failedEvent()]);

    const [first, second] = await Promise.all([
      recoverFailedWebhookEvents(),
      recoverFailedWebhookEvents(),
    ]);

    // Ambos ven el evento en el escaneo, pero sólo uno gana el claim.
    expect(first.claimed + second.claimed).toBe(1);
    expect(first.skippedLocked + second.skippedLocked).toBe(1);
    expect(first.recovered + second.recovered).toBe(1);

    // Y el pago se liquidó una sola vez.
    expect(H.current!.rpcCalls.filter((c) => c.name === "finalize_epayco_approved_payment")).toHaveLength(1);
    expect(H.current!.store.payments).toHaveLength(1);
  });

  it("un evento con lease vigente de otro worker se salta", async () => {
    seed([failedEvent({ locked_at: new Date().toISOString(), locked_by: "otro-worker" })]);

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.scanned).toBe(1);
    expect(outcome.claimed).toBe(0);
    expect(outcome.skippedLocked).toBe(1);
    expect(events()[0].locked_by).toBe("otro-worker");
    expect(events()[0].status).toBe("failed");
  });

  it("un lease vencido se puede reclamar: un worker muerto no bloquea la fila", async () => {
    // LEASE_SECONDS = 120; 5 minutos atrás está caducado.
    seed([failedEvent({ locked_at: behind(300_000), locked_by: "worker-muerto" })]);

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.claimed).toBe(1);
    expect(outcome.recovered).toBe(1);
    expect(events()[0].status).toBe("processed");
    // El lease se libera al terminar.
    expect(events()[0].locked_at).toBeNull();
    expect(events()[0].locked_by).toBeNull();
  });

  it("el lease se libera también cuando el evento va a revisión", async () => {
    seed([failedEvent({ last_error: "environment_mismatch" })]);
    await recoverFailedWebhookEvents();
    expect(events()[0].locked_at).toBeNull();
    expect(events()[0].locked_by).toBeNull();
  });

  it("el lease se libera tras un reintento fallido", async () => {
    seed([failedEvent({ attempt_count: 1 })]);
    H.current!.store.checkout_sessions = [];
    await recoverFailedWebhookEvents();
    expect(events()[0].locked_by).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Errores de escritura y de auditoría
// ---------------------------------------------------------------------------

describe("Errores de escritura", () => {
  it("si el claim no se puede escribir, el evento no se procesa", async () => {
    seed([failedEvent()], {
      errorOn: {
        billing_webhook_events: { update: { code: "42501", message: "permission denied" } },
      },
    });

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.claimed).toBe(0);
    expect(outcome.recovered).toBe(0);
    expect(events()[0].status).toBe("failed");
    expect(H.current!.rpcCalls).toHaveLength(0);
  });

  it("si markEvent falla tras liquidar, NO se cuenta como recuperado y se reporta", async () => {
    seed([failedEvent()], {
      // skip:1 deja pasar el claim y hace fallar la escritura de cierre.
      errorOn: {
        billing_webhook_events: {
          update: { code: "42501", message: "permission denied", skip: 1 },
        },
      },
    });

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.claimed).toBe(1);
    expect(outcome.recovered).toBe(0);
    expect(outcome.writeFailures).toBe(1);
    // El evento queda como estaba: nadie puede afirmar que se recuperó.
    expect(events()[0].status).toBe("failed");
  });

  it("un fallo al cerrar un evento de revisión también se reporta", async () => {
    seed([failedEvent({ last_error: "reference_mismatch" })], {
      errorOn: {
        billing_webhook_events: {
          update: { code: "42501", message: "permission denied", skip: 1 },
        },
      },
    });

    const outcome = await recoverFailedWebhookEvents();

    expect(outcome.deadLettered).toBe(0);
    expect(outcome.writeFailures).toBe(1);
    expect(events()[0].status).toBe("failed");
  });

  it("si falla la auditoría, la recuperación NO se revierte pero se contabiliza", async () => {
    seed([failedEvent()], {
      errorOn: {
        billing_audit_events: { insert: { code: "42501", message: "permission denied" } },
      },
    });

    const outcome = await recoverFailedWebhookEvents();

    // El efecto sobre el cobro ya ocurrió: revertirlo dejaría un estado peor.
    expect(outcome.recovered).toBe(1);
    expect(events()[0].status).toBe("processed");
    // Pero el fallo queda visible para conciliación.
    expect(outcome.auditFailures).toBe(1);
    expect(auditRows()).toHaveLength(0);
  });

  it("el cron devuelve auditFailures y writeFailures en su respuesta", async () => {
    seed([failedEvent()], {
      errorOn: {
        billing_audit_events: { insert: { code: "42501", message: "permission denied" } },
      },
    });
    const body = await (await recoveryCron(authedRequest())).json();
    expect(body).toMatchObject({ ok: true, recovered: 1, auditFailures: 1, writeFailures: 0 });
  });
});

// ---------------------------------------------------------------------------
// Reintento sin duplicar efectos
// ---------------------------------------------------------------------------

describe("Reintento sin duplicar pago ni suscripción", () => {
  it("dos pasadas sobre el mismo evento no crean dos pagos ni activan dos veces", async () => {
    seed([failedEvent()]);

    const first = await recoverFailedWebhookEvents();
    expect(first.recovered).toBe(1);
    const paymentsAfterFirst = (H.current!.store.payments as unknown[]).length;
    expect(paymentsAfterFirst).toBe(1);

    // Se revive el evento a mano (conservando su motivo) para forzar una
    // segunda pasada real sobre un checkout que ya quedó aprobado.
    events()[0].status = "failed";
    events()[0].next_attempt_at = null;
    events()[0].last_error = "atomic_activation_failed";
    const second = await recoverFailedWebhookEvents();

    // La liquidación ve el checkout fuera de `pending` => `ignored`.
    expect(second.recovered).toBe(1);
    expect((H.current!.store.payments as unknown[]).length).toBe(paymentsAfterFirst);
    expect(
      H.current!.rpcCalls.filter((c) => c.name === "finalize_epayco_approved_payment"),
    ).toHaveLength(1);
  });

  it("un reintento tras un fallo transitorio del RPC no duplica el pago", async () => {
    // Primera pasada: el RPC falla una vez; el pago sí queda registrado.
    seed([failedEvent()], { failRpc: { times: 1 } });

    const first = await recoverFailedWebhookEvents();
    expect(first.retried).toBe(1);
    expect(events()[0].attempt_count).toBe(1);
    const paymentsAfterFirst = (H.current!.store.payments as unknown[]).length;
    expect(paymentsAfterFirst).toBe(1);

    // Segunda pasada: el RPC ya funciona.
    events()[0].next_attempt_at = null;
    const second = await recoverFailedWebhookEvents();

    expect(second.recovered).toBe(1);
    // El pago se reutiliza por (provider, environment, provider_transaction_id).
    expect((H.current!.store.payments as unknown[]).length).toBe(paymentsAfterFirst);
    // Y la activación efectiva ocurrió una sola vez.
    expect(H.current!.store.checkout_sessions[0].status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Requisito de esquema (migración 034)
// ---------------------------------------------------------------------------

describe("Migración 034 · columna locked_by", () => {
  it("sin la columna, el worker se detiene en vez de procesar sin lease", async () => {
    seed([failedEvent()], {
      errorOn: {
        billing_webhook_events: {
          update: { code: "42703", message: 'column "locked_by" does not exist' },
        },
      },
    });

    await expect(recoverFailedWebhookEvents()).rejects.toThrow(/locked_by/);
    expect(events()[0].status).toBe("failed");
  });

  it("el cron responde 503 SCHEMA_NOT_READY en ese caso", async () => {
    seed([failedEvent()], {
      errorOn: {
        billing_webhook_events: {
          update: { code: "42703", message: 'column "locked_by" does not exist' },
        },
      },
    });

    const res = await recoveryCron(authedRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("SCHEMA_NOT_READY");
  });
});

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

describe("GET /api/cron/billing-webhook-recovery", () => {
  it("401 sin CRON_SECRET válido", async () => {
    seed([failedEvent()]);
    const res = await recoveryCron({ headers: { get: () => null } } as unknown as Parameters<typeof recoveryCron>[0]);
    expect(res.status).toBe(401);
    expect(events()[0].status).toBe("failed");
  });

  it("200 con el resumen del lote", async () => {
    seed([failedEvent()]);
    const res = await recoveryCron(authedRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, scanned: 1, recovered: 1 });
  });
});
