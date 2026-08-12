// E2E real · Ejecuta el WORKER REAL de recuperación contra PostgreSQL.
//
// Los 53 casos de `webhook-recovery.test.ts` corren contra el doble en memoria:
// prueban la lógica, pero no las constraints, ni los tipos, ni el comportamiento
// transaccional. Esta suite ejecuta `recoverFailedWebhookEvents` **sin
// modificarlo** contra una base PostgreSQL desechable; lo único sustituido es el
// cliente Supabase, reemplazado por un adaptador respaldado por `pg` porque la
// base local no tiene PostgREST.
//
// SE SALTA sin `QA_DATABASE_URL`, igual que la suite de tests/.
//
//   QA_DATABASE_URL=postgres://postgres@127.0.0.1:55432/qatest \
//     npx vitest run src/qa-e2e/webhook-recovery-pg.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createPgSupabaseAdapter } from "./helpers/pg-supabase-adapter";

const CONNECTION = process.env.QA_DATABASE_URL;

// Misma guarda que el resto: nunca contra un entorno gestionado.
const FORBIDDEN = /supabase\.co|production|\bprod\b|amazonaws\.com|neon\.tech/i;
if (CONNECTION && FORBIDDEN.test(CONNECTION)) {
  throw new Error("QA_DATABASE_URL apunta a un entorno gestionado; esta suite escribe datos.");
}

const adapter = CONNECTION ? createPgSupabaseAdapter(CONNECTION, "smarttalk") : null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (globalThis as never as { __qaPgClient: unknown }).__qaPgClient,
}));

// El worker no usa el cliente de servidor, pero el módulo se importa en cadena.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { recoverFailedWebhookEvents } from "@/lib/billing/webhook-recovery";

type Sql = { query: (text: string, values?: unknown[]) => Promise<{ rows: never[] }>; end: () => Promise<void> };
let sql: Sql;

beforeAll(async () => {
  if (!CONNECTION) return;
  (globalThis as never as { __qaPgClient: unknown }).__qaPgClient = adapter!.client;
  const pg = (await import("pg")).default;
  sql = new pg.Client({ connectionString: CONNECTION }) as unknown as Sql;
  await (sql as unknown as { connect: () => Promise<void> }).connect();
});

/** Ids creados por esta suite, para no dejar restos entre ejecuciones. */
const creados: string[] = [];

afterAll(async () => {
  if (!CONNECTION) return;
  // `qa_cleanup_fixtures` sólo borra organizaciones, planes y checkouts: los
  // eventos y su auditoría hay que limpiarlos aquí o se acumulan entre corridas
  // y contaminan la siguiente.
  if (creados.length) {
    await sql.query("DELETE FROM smarttalk.billing_audit_events WHERE entity_id = ANY($1)", [creados]);
    await sql.query("DELETE FROM smarttalk.billing_outbox_jobs WHERE webhook_event_id = ANY($1)", [creados]);
    await sql.query("DELETE FROM smarttalk.billing_webhook_events WHERE id = ANY($1)", [creados]);
  }
  await sql.query("SELECT smarttalk.qa_cleanup_fixtures()");
  await sql.end();
  await adapter!.end();
});

/** Siembra una suscripción suspendida y un evento fallido apuntando a su checkout. */
async function seedFailedEvent(lastError = "atomic_activation_failed") {
  const seeded = await sql.query("SELECT smarttalk.qa_seed_lifecycle_case('suspended', 'e2e') AS ctx");
  const ctx = (seeded.rows[0] as never as { ctx: Record<string, string> }).ctx;

  const checkout = await sql.query(
    "SELECT internal_reference FROM smarttalk.checkout_sessions WHERE id = $1",
    [ctx.checkout_session_id],
  );
  const reference = (checkout.rows[0] as never as { internal_reference: string }).internal_reference;

  // El escenario fiel: el webhook original YA registró el pago y luego falló la
  // activación. Por tanto la clave del evento es el `provider_transaction_id`
  // de ese pago. Usar una distinta haría que el worker intentara insertar un
  // segundo pago para la misma referencia, que el índice único rechaza —y el
  // fallo sería del montaje de la prueba, no del worker.
  const pago = await sql.query(
    "SELECT provider_transaction_id FROM smarttalk.payments WHERE checkout_session_id = $1",
    [ctx.checkout_session_id],
  );
  const eventKey = (pago.rows[0] as never as { provider_transaction_id: string })
    .provider_transaction_id;

  const payload = {
    x_cust_id_cliente: "qa-cust",
    x_ref_payco: "REF-E2E",
    x_transaction_id: eventKey,
    x_amount: "59000.00",
    x_currency_code: "COP",
    x_cod_response: "1",
    x_response: "1",
    x_extra1: ctx.checkout_session_id,
    x_extra2: reference,
    x_id_invoice: reference,
    x_test_request: "true",
  };

  const event = await sql.query(
    `INSERT INTO smarttalk.billing_webhook_events(
       provider, environment, event_key, payload_hash, signature_valid,
       status, attempt_count, last_error, payload)
     VALUES ('epayco','sandbox',$1,'qa-hash',TRUE,'failed',1,$2,$3::jsonb)
     RETURNING id`,
    [eventKey, lastError, JSON.stringify(payload)],
  );

  const eventId = (event.rows[0] as never as { id: string }).id;
  creados.push(eventId);
  return { ctx, eventId, eventKey };
}

const eventRow = async (id: string) =>
  (
    await sql.query(
      "SELECT status, last_error, last_error_code, locked_by, attempt_count FROM smarttalk.billing_webhook_events WHERE id=$1",
      [id],
    )
  ).rows[0] as never as Record<string, unknown>;

describe.skipIf(!CONNECTION)("E2E · worker real contra PostgreSQL", () => {
  it("recupera un evento fallido controlado y activa la suscripción", async () => {
    const { ctx, eventId } = await seedFailedEvent();

    // ---- El worker real, sin modificar ----
    const outcome = await recoverFailedWebhookEvents(25);

    expect(outcome.scanned).toBeGreaterThanOrEqual(1);
    expect(outcome.claimed).toBeGreaterThanOrEqual(1);
    expect(outcome.recovered).toBeGreaterThanOrEqual(1);
    expect(outcome.writeFailures).toBe(0);
    expect(outcome.auditFailures).toBe(0);
    expect(outcome.workerId).toMatch(/^vercel-webhook-recovery-/);

    const event = await eventRow(eventId);
    expect(event.status).toBe("processed");
    expect(event.last_error).toBeNull();
    expect(event.locked_by).toBeNull();

    const subs = await sql.query(
      "SELECT id, status, suspended_at FROM smarttalk.subscriptions WHERE organization_id=$1",
      [ctx.organization_id],
    );
    expect(subs.rows).toHaveLength(1);
    expect((subs.rows[0] as never as { status: string }).status).toBe("active");
    expect((subs.rows[0] as never as { suspended_at: string | null }).suspended_at).toBeNull();

    // D-1: la recuperación queda auditada.
    const audit = await sql.query(
      "SELECT action, result, actor_type FROM smarttalk.billing_audit_events WHERE entity_id=$1",
      [eventId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: "webhook_recovery_processed",
      result: "success",
      actor_type: "system",
    });

    // Sin pagos duplicados.
    const pagos = await sql.query(
      "SELECT count(*)::int AS n FROM smarttalk.payments WHERE organization_id=$1",
      [ctx.organization_id],
    );
    expect((pagos.rows[0] as never as { n: number }).n).toBe(1);
  });

  it("una segunda pasada no reprocesa lo ya procesado", async () => {
    // El conteo replica el filtro completo del worker (§33.1): estado, firma,
    // intentos y turno. Contar sólo por estado daría un número mayor —los
    // eventos agotados o con backoff pendiente no son elegibles— y la
    // comparación fallaría por un motivo que no es el que se quiere probar.
    const elegibles = await sql.query(
      `SELECT count(*)::int AS n FROM smarttalk.billing_webhook_events
        WHERE status = 'failed' AND signature_valid = TRUE
          AND attempt_count < 5
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())`,
    );
    const outcome = await recoverFailedWebhookEvents(25);
    expect(outcome.scanned).toBe((elegibles.rows[0] as never as { n: number }).n);
    expect(outcome.writeFailures).toBe(0);
  });

  it("D-2: un conflicto de datos va a revisión y NO bloquea la organización", async () => {
    const { ctx, eventId } = await seedFailedEvent("amount_or_currency_mismatch");

    const outcome = await recoverFailedWebhookEvents(25);
    expect(outcome.flaggedForReview).toBeGreaterThanOrEqual(1);

    const event = await eventRow(eventId);
    expect(event.status).toBe("dead_letter");
    expect(event.last_error_code).toBe("review_required");

    // La organización sigue activa: D-2 alerta, no bloquea.
    const org = await sql.query("SELECT is_active FROM smarttalk.organizations WHERE id=$1", [
      ctx.organization_id,
    ]);
    expect((org.rows[0] as never as { is_active: boolean }).is_active).toBe(true);

    // El fixture no crea un agente administrador con correo; por eso no se
    // afirma aquí que exista un destinatario. La encolación con destinatario
    // está cubierta por la suite de outbox/notificaciones. Este caso verifica
    // el contrato D-2: dead_letter, revisión y organización sin bloqueo.
  });

  it("D-1: un evento con firma inválida NUNCA se toca", async () => {
    const { eventId } = await seedFailedEvent();
    await sql.query("UPDATE smarttalk.billing_webhook_events SET signature_valid=FALSE WHERE id=$1", [
      eventId,
    ]);

    await recoverFailedWebhookEvents(25);

    const event = await eventRow(eventId);
    expect(event.status).toBe("failed");
    expect(event.locked_by).toBeNull();
    expect(event.attempt_count).toBe(1);
  });
});
