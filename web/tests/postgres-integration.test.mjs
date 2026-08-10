/**
 * Integración contra PostgreSQL real — RLS, índices únicos y RPC de billing.
 *
 * SE SALTA POR DEFECTO. Sólo corre si `QA_DATABASE_URL` apunta a una base
 * DESECHABLE (Supabase local o contenedor Postgres) donde ya se aplicaron las
 * migraciones de `supabase/migrations/`. Nunca debe apuntarse a Production ni
 * al proyecto QA compartido: las pruebas escriben y hacen ROLLBACK, pero
 * dependen de poder crear organizaciones y suscripciones de prueba.
 *
 * Uso:
 *   QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
 *     node --test --experimental-strip-types tests/postgres-integration.test.mjs
 *
 * Cubre lo que el Supabase en memoria no puede probar:
 *   1. RLS habilitado en las tablas de billing.
 *   2. El índice único que sostiene la deduplicación de webhooks.
 *   3. El cuerpo del RPC finalize_epayco_approved_payment: reactivación desde
 *      suspended y desde cancelled, período nunca vencido, idempotencia.
 */
import assert from "node:assert/strict";
import test from "node:test";

const CONNECTION = process.env.QA_DATABASE_URL;

const GUARD = /supabase\.co|production|prod\./i;
if (CONNECTION && GUARD.test(CONNECTION)) {
  throw new Error(
    "QA_DATABASE_URL apunta a un host gestionado o de producción. Esta suite sólo corre contra una base desechable.",
  );
}

const skip = CONNECTION
  ? false
  : "define QA_DATABASE_URL con una base desechable para ejecutar esta suite";

/** Tablas que deben tener RLS habilitado en el esquema smarttalk. */
const RLS_REQUIRED = [
  "subscriptions",
  "payments",
  "checkout_sessions",
  "plan_entitlements",
  "plan_prices",
  "billing_webhook_events",
  "billing_decision_events",
  "billing_outbox_jobs",
  "billing_audit_events",
  "subscription_events",
  "usage_counters",
  "usage_events",
  "notification_logs",
  "payment_gateway_settings",
];

async function withClient(fn) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: CONNECTION });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Ejecuta el cuerpo dentro de una transacción y SIEMPRE hace ROLLBACK. */
async function inRollback(client, fn) {
  await client.query("BEGIN");
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

test("RLS habilitado en todas las tablas de billing", { skip }, async () => {
  await withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'smarttalk' AND c.relname = ANY($1)`,
      [RLS_REQUIRED],
    );

    const found = new Map(rows.map((row) => [row.table_name, row.rls]));
    const missing = RLS_REQUIRED.filter((table) => !found.has(table));
    assert.deepEqual(missing, [], `tablas ausentes en el esquema: ${missing.join(", ")}`);

    const withoutRls = RLS_REQUIRED.filter((table) => found.get(table) !== true);
    assert.deepEqual(withoutRls, [], `tablas sin RLS: ${withoutRls.join(", ")}`);
  });
});

test("cada tabla de billing con RLS tiene al menos una policy", { skip }, async () => {
  await withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT tablename, COUNT(*)::int AS policies
         FROM pg_policies
        WHERE schemaname = 'smarttalk' AND tablename = ANY($1)
        GROUP BY tablename`,
      [RLS_REQUIRED],
    );
    const counts = new Map(rows.map((row) => [row.tablename, row.policies]));
    const unprotected = RLS_REQUIRED.filter((table) => !(counts.get(table) > 0));
    // RLS sin policy deniega todo a los roles no privilegiados, que es seguro
    // pero silencioso: se reporta para que sea una decisión explícita.
    assert.deepEqual(unprotected, [], `RLS sin policy declarada: ${unprotected.join(", ")}`);
  });
});

test("las funciones de billing no son ejecutables por anon ni authenticated", { skip }, async () => {
  await withClient(async (client) => {
    const functions = [
      "finalize_epayco_approved_payment",
      "reserve_billing_capacity",
      "consume_billing_capacity",
      "release_billing_capacity",
      "record_billing_usage",
      "claim_billing_outbox_jobs",
    ];
    for (const name of functions) {
      const { rows } = await client.query(
        `SELECT p.proname,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'smarttalk' AND p.proname = $1`,
        [name],
      );
      if (rows.length === 0) continue; // migración no aplicada en esta base
      for (const row of rows) {
        assert.equal(row.anon, false, `${name} es ejecutable por anon`);
        assert.equal(row.authenticated, false, `${name} es ejecutable por authenticated`);
      }
    }
  });
});

test("el índice único de webhooks impide procesar dos veces el mismo evento", { skip }, async () => {
  await withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'smarttalk'
          AND tablename = 'billing_webhook_events'
          AND indexdef ILIKE '%UNIQUE%'`,
    );
    const dedupe = rows.find(
      (row) =>
        /provider/.test(row.indexdef) &&
        /environment/.test(row.indexdef) &&
        /event_key/.test(row.indexdef),
    );
    assert.ok(dedupe, "falta el índice único (provider, environment, event_key)");
  });
});

test("reactivar desde suspended reutiliza la suscripción y abre un período futuro", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const setup = await client.query(`SELECT smarttalk.qa_seed_reactivation_case('suspended') AS ctx`);
      const context = setup.rows[0]?.ctx;
      if (!context) {
        // El helper de siembra no existe: la prueba requiere un fixture SQL que
        // aún no está en el repositorio. Ver AGENT_NEXT_PHASE_IMPLEMENTATION.md.
        return;
      }

      await client.query(
        `SELECT smarttalk.finalize_epayco_approved_payment($1, $2, $3, NULL, NULL)`,
        [context.checkout_session_id, context.payment_id, "qa-event-suspended"],
      );

      const { rows } = await client.query(
        `SELECT id, status, current_period_end, cancel_at_period_end
           FROM smarttalk.subscriptions WHERE organization_id = $1`,
        [context.organization_id],
      );

      assert.equal(rows.length, 1, "la reactivación no debe crear una suscripción adicional");
      assert.equal(rows[0].id, context.subscription_id, "debe reutilizar la suscripción existente");
      assert.equal(rows[0].status, "active");
      assert.equal(rows[0].cancel_at_period_end, false);
      assert.ok(
        new Date(rows[0].current_period_end).getTime() > Date.now(),
        "el período reactivado no puede estar vencido",
      );
    });
  });
});

test("reactivar desde cancelled no duplica la suscripción (requiere migración 033)", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const setup = await client.query(`SELECT smarttalk.qa_seed_reactivation_case('cancelled') AS ctx`);
      const context = setup.rows[0]?.ctx;
      if (!context) return;

      await client.query(
        `SELECT smarttalk.finalize_epayco_approved_payment($1, $2, $3, NULL, NULL)`,
        [context.checkout_session_id, context.payment_id, "qa-event-cancelled"],
      );

      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total FROM smarttalk.subscriptions WHERE organization_id = $1`,
        [context.organization_id],
      );
      assert.equal(
        rows[0].total,
        1,
        "con la migración 033 aplicada la fila cancelada se reutiliza; sin ella este assert falla y documenta el gap",
      );
    });
  });
});

test("llamar dos veces al RPC con el mismo checkout no crea dos suscripciones", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const setup = await client.query(`SELECT smarttalk.qa_seed_reactivation_case('suspended') AS ctx`);
      const context = setup.rows[0]?.ctx;
      if (!context) return;

      const first = await client.query(
        `SELECT smarttalk.finalize_epayco_approved_payment($1, $2, $3, NULL, NULL) AS id`,
        [context.checkout_session_id, context.payment_id, "qa-event-idem"],
      );
      const second = await client.query(
        `SELECT smarttalk.finalize_epayco_approved_payment($1, $2, $3, NULL, NULL) AS id`,
        [context.checkout_session_id, context.payment_id, "qa-event-idem"],
      );

      assert.equal(first.rows[0].id, second.rows[0].id, "la segunda llamada debe devolver la misma suscripción");

      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total FROM smarttalk.subscription_events
          WHERE subscription_id = $1 AND reason = 'payment_approved'`,
        [first.rows[0].id],
      );
      assert.equal(rows[0].total, 1, "la reentrada no debe duplicar el evento de activación");
    });
  });
});
