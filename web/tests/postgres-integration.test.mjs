/**
 * Integración contra PostgreSQL real — RLS, índices únicos, RPC de billing y
 * ciclo de vida de suscripciones.
 *
 * SE SALTA POR DEFECTO. Ejecutar siempre a través del runner, que valida el
 * destino, carga los fixtures y limpia al terminar:
 *
 *   QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
 *     node scripts/qa-postgres-suite.mjs
 *
 * Cada test que escribe lo hace dentro de BEGIN … ROLLBACK, así que la base
 * queda como estaba. Nunca debe apuntarse a Production ni al proyecto QA
 * compartido.
 */
import assert from "node:assert/strict";
import test from "node:test";

const CONNECTION = process.env.QA_DATABASE_URL;

const FORBIDDEN = /supabase\.co|production|\bprod\b|prod\.|amazonaws\.com|neon\.tech/i;
if (CONNECTION && FORBIDDEN.test(CONNECTION)) {
  throw new Error(
    "QA_DATABASE_URL apunta a un host gestionado o de producción. Esta suite siembra datos y sólo corre contra una base desechable.",
  );
}

const skip = CONNECTION
  ? false
  : "usa scripts/qa-postgres-suite.mjs con QA_DATABASE_URL apuntando a una base desechable";

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

/** Siembra un caso de ciclo de vida. Falla con instrucciones si faltan fixtures. */
async function seed(client, testCase) {
  try {
    const { rows } = await client.query(`SELECT smarttalk.qa_seed_lifecycle_case($1) AS ctx`, [testCase]);
    return rows[0].ctx;
  } catch (error) {
    if (/does not exist/i.test(error.message)) {
      throw new Error(
        "Faltan los fixtures de QA. Ejecuta la suite con scripts/qa-postgres-suite.mjs, " +
          "que carga supabase/qa/001_qa_lifecycle_fixtures.sql antes de correr los tests.",
      );
    }
    throw error;
  }
}

const finalize = (client, ctx, eventKey) =>
  client.query(`SELECT smarttalk.finalize_epayco_approved_payment($1, $2, $3, NULL, NULL) AS id`, [
    ctx.checkout_session_id,
    ctx.payment_id,
    eventKey,
  ]);

const subscriptionsOf = (client, ctx) =>
  client.query(
    `SELECT id, status, plan_id, plan_price_id, current_period_start, current_period_end,
            cancel_at_period_end, grace_ends_at, suspended_at, cancelled_at, status_reason,
            pending_plan_id, pending_plan_price_id, change_effective_at
       FROM smarttalk.subscriptions WHERE organization_id = $1 ORDER BY created_at`,
    [ctx.organization_id],
  );

// ===========================================================================
// 1-4. RLS, policies, privilegios e índices
// ===========================================================================

test("1. RLS habilitado en todas las tablas de billing", { skip }, async () => {
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

/**
 * Tablas con RLS habilitado y **sin policy a propósito**: son colas internas
 * que ningún usuario final debe leer ni escribir. RLS sin policy deniega todo a
 * los roles no privilegiados; sólo `service_role` (BYPASSRLS) las alcanza.
 *
 * Verificado en ejecución el 2026-08-10: `billing_outbox_jobs` estaba en esta
 * situación desde la migración 010. Se deja explícito aquí en vez de añadirle
 * una policy permisiva, porque denegar todo es la postura correcta para una
 * cola de trabajo.
 */
const RLS_DENY_ALL_BY_DESIGN = ["billing_outbox_jobs"];

test("2. cada tabla de billing con RLS tiene policy, o deniega todo a propósito", { skip }, async () => {
  await withClient(async (client) => {
    const { rows } = await client.query(
      `SELECT tablename, COUNT(*)::int AS policies
         FROM pg_policies
        WHERE schemaname = 'smarttalk' AND tablename = ANY($1)
        GROUP BY tablename`,
      [RLS_REQUIRED],
    );
    const counts = new Map(rows.map((row) => [row.tablename, row.policies]));

    const unprotected = RLS_REQUIRED.filter(
      (table) => !(counts.get(table) > 0) && !RLS_DENY_ALL_BY_DESIGN.includes(table),
    );
    assert.deepEqual(unprotected, [], `RLS sin policy declarada: ${unprotected.join(", ")}`);

    // Y las que deniegan todo deben seguir haciéndolo: si alguien les añade una
    // policy, es una decisión que debe revisarse, no un cambio silencioso.
    for (const table of RLS_DENY_ALL_BY_DESIGN) {
      assert.equal(
        counts.get(table) ?? 0,
        0,
        `${table} ganó una policy: revisa si exponerla es intencional`,
      );
    }
  });
});

test("3. las funciones de billing no son ejecutables por anon ni authenticated", { skip }, async () => {
  await withClient(async (client) => {
    const functions = [
      "finalize_epayco_approved_payment",
      "reserve_billing_capacity",
      "consume_billing_capacity",
      "release_billing_capacity",
      "record_billing_usage",
      "claim_billing_outbox_jobs",
    ];
    let checked = 0;
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
      for (const row of rows) {
        checked += 1;
        assert.equal(row.anon, false, `${name} es ejecutable por anon`);
        assert.equal(row.authenticated, false, `${name} es ejecutable por authenticated`);
      }
    }
    assert.ok(checked > 0, "no se encontró ninguna función de billing: ¿migraciones aplicadas?");
  });
});

test("4. el índice único de webhooks impide procesar dos veces el mismo evento", { skip }, async () => {
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

    // Y se comprueba en ejecución, no sólo por catálogo.
    await inRollback(client, async () => {
      const insert = () =>
        client.query(
          `INSERT INTO smarttalk.billing_webhook_events(provider, environment, event_key, payload_hash, signature_valid, status, payload)
           VALUES ('epayco', 'sandbox', 'QA-DEDUPE-1', 'hash', TRUE, 'processing', '{}')`,
        );
      await insert();
      await assert.rejects(insert, (error) => error.code === "23505");
    });
  });
});

// ===========================================================================
// 5-7. Ciclo de vida y RPC de activación
// ===========================================================================

test("5. reactivar desde suspended reutiliza la suscripción y abre un período futuro", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "suspended");
      await finalize(client, ctx, "qa-event-suspended");

      const { rows } = await subscriptionsOf(client, ctx);
      assert.equal(rows.length, 1, "la reactivación no debe crear una suscripción adicional");
      assert.equal(rows[0].id, ctx.subscription_id, "debe reutilizar la suscripción existente");
      assert.equal(rows[0].status, "active");
      assert.equal(rows[0].cancel_at_period_end, false);
      assert.equal(rows[0].suspended_at, null, "suspended_at debe limpiarse al reactivar");
      assert.equal(rows[0].status_reason, "payment_approved");
      assert.ok(
        new Date(rows[0].current_period_end).getTime() > Date.now(),
        "el período reactivado no puede estar vencido",
      );
      assert.ok(
        new Date(rows[0].current_period_start).getTime() <= Date.now() + 1000,
        "el período debe arrancar en el momento del pago, no heredar el vencido",
      );
    });
  });
});

test("6. reactivar desde cancelled no duplica la suscripción (requiere migración 033)", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "cancelled");
      await finalize(client, ctx, "qa-event-cancelled");

      const { rows } = await subscriptionsOf(client, ctx);
      assert.equal(
        rows.length,
        1,
        "sin la migración 033 el RPC inserta una segunda suscripción; este fallo documenta ese gap",
      );
      assert.equal(rows[0].id, ctx.subscription_id, "debe reutilizar la fila cancelada");
      assert.equal(rows[0].status, "active");
      assert.equal(rows[0].cancelled_at, null, "cancelled_at debe limpiarse al reactivar");
    });
  });
});

test("7. llamar dos veces al RPC con el mismo checkout no crea dos suscripciones", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "suspended");

      const first = await finalize(client, ctx, "qa-event-idem");
      const second = await finalize(client, ctx, "qa-event-idem");

      assert.equal(first.rows[0].id, second.rows[0].id, "la segunda llamada debe devolver la misma suscripción");

      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total FROM smarttalk.subscription_events
          WHERE subscription_id = $1 AND reason = 'payment_approved'`,
        [first.rows[0].id],
      );
      assert.equal(rows[0].total, 1, "la reentrada no debe duplicar el evento de activación");

      const { rows: subs } = await subscriptionsOf(client, ctx);
      assert.equal(subs.length, 1);
    });
  });
});

// ===========================================================================
// 8-12. Fixtures de ciclo de vida — estados y transiciones por pago
// ===========================================================================

test("8. los fixtures producen cada estado del ciclo de vida", { skip }, async () => {
  await withClient(async (client) => {
    const expected = {
      active: "active",
      past_due: "past_due",
      grace_period: "past_due",
      past_due_expired: "past_due",
      suspended: "suspended",
      cancelled: "cancelled",
      renewal: "active",
      plan_change: "active",
    };

    for (const [testCase, status] of Object.entries(expected)) {
      await inRollback(client, async () => {
        const ctx = await seed(client, testCase);
        const { rows } = await subscriptionsOf(client, ctx);
        assert.equal(rows.length, 1, `${testCase}: debe sembrar una suscripción`);
        assert.equal(rows[0].status, status, `${testCase}: estado sembrado incorrecto`);
      });
    }

    await inRollback(client, async () => {
      const ctx = await seed(client, "no_subscription");
      const { rows } = await subscriptionsOf(client, ctx);
      assert.equal(rows.length, 0, "no_subscription no debe sembrar suscripción");
      assert.equal(ctx.subscription_id, null);
    });
  });
});

test("9. la ventana de gracia distingue past_due vigente de gracia vencida", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "grace_period");
      const { rows } = await subscriptionsOf(client, ctx);
      assert.ok(
        new Date(rows[0].grace_ends_at).getTime() > Date.now(),
        "grace_period debe dejar la gracia vigente",
      );
    });

    await inRollback(client, async () => {
      const ctx = await seed(client, "past_due_expired");
      const { rows } = await subscriptionsOf(client, ctx);
      assert.ok(
        new Date(rows[0].grace_ends_at).getTime() < Date.now(),
        "past_due_expired debe dejar la gracia terminada",
      );
    });
  });
});

test("10. la renovación extiende el período desde el fin del actual, no desde hoy", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "renewal");
      const { rows: before } = await subscriptionsOf(client, ctx);
      const previousEnd = new Date(before[0].current_period_end);

      await finalize(client, ctx, "qa-event-renewal");

      const { rows: after } = await subscriptionsOf(client, ctx);
      assert.equal(after.length, 1, "renovar no debe crear una suscripción nueva");
      assert.equal(
        new Date(after[0].current_period_start).getTime(),
        previousEnd.getTime(),
        "el nuevo período debe arrancar donde terminaba el anterior (sin regalar días)",
      );
      assert.ok(new Date(after[0].current_period_end).getTime() > previousEnd.getTime());
    });
  });
});

test("11. el cambio de plan mueve plan_id y no duplica la suscripción", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "plan_change");
      const { rows: before } = await subscriptionsOf(client, ctx);
      assert.equal(before[0].plan_id, ctx.plan_a_id, "el fixture arranca en el plan A");

      await finalize(client, ctx, "qa-event-plan-change");

      const { rows: after } = await subscriptionsOf(client, ctx);
      assert.equal(after.length, 1, "cambiar de plan no debe crear una suscripción nueva");
      assert.equal(after[0].plan_id, ctx.plan_b_id, "debe quedar en el plan del checkout");
      assert.equal(after[0].status, "active");

      const { rows: org } = await client.query(
        `SELECT plan_id FROM smarttalk.organizations WHERE id = $1`,
        [ctx.organization_id],
      );
      assert.equal(org[0].plan_id, ctx.plan_b_id, "organizations.plan_id debe seguir al cambio");
    });
  });
});

test("12. cada activación por pago deja exactamente un subscription_event de proveedor", { skip }, async () => {
  await withClient(async (client) => {
    for (const testCase of ["suspended", "cancelled", "renewal", "plan_change"]) {
      await inRollback(client, async () => {
        const ctx = await seed(client, testCase);
        await finalize(client, ctx, `qa-event-${testCase}-audit`);

        const { rows } = await client.query(
          `SELECT actor_type, new_status, reason, correlation_id
             FROM smarttalk.subscription_events
            WHERE organization_id = $1`,
          [ctx.organization_id],
        );
        assert.equal(rows.length, 1, `${testCase}: debe registrar un único evento`);
        assert.equal(rows[0].actor_type, "provider");
        assert.equal(rows[0].new_status, "active");
        assert.equal(rows[0].reason, "payment_approved");
        assert.equal(
          rows[0].correlation_id,
          `qa-event-${testCase}-audit`,
          "el correlation_id debe ser la clave del evento del proveedor",
        );
      });
    }
  });
});

// ===========================================================================
// 14-17. Downgrade programado (D-5 / H-12, migración 035)
// ===========================================================================

test("14. un downgrade NO cambia el plan: lo programa para el fin del período", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "plan_downgrade");
      const { rows: before } = await subscriptionsOf(client, ctx);
      const periodEndBefore = new Date(before[0].current_period_end);
      assert.equal(before[0].plan_id, ctx.plan_b_id, "el fixture arranca en el plan caro");

      await finalize(client, ctx, "qa-event-downgrade");

      const { rows: after } = await subscriptionsOf(client, ctx);
      assert.equal(after.length, 1, "un downgrade no debe crear otra suscripción");
      assert.equal(after[0].plan_id, ctx.plan_b_id, "el plan actual se conserva hasta el fin del período");
      assert.equal(after[0].pending_plan_id, ctx.plan_a_id, "el plan destino queda pendiente");
      assert.equal(after[0].pending_plan_price_id, ctx.price_a_id);
      assert.equal(
        new Date(after[0].change_effective_at).getTime(),
        periodEndBefore.getTime(),
        "el cambio debe hacerse efectivo justo al terminar el período vigente",
      );
      assert.equal(after[0].status, "active");
      assert.equal(after[0].status_reason, "plan_downgrade_scheduled");
    });
  });
});

test("15. el downgrade extiende el período sin regalar ni quitar días", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "plan_downgrade");
      const { rows: before } = await subscriptionsOf(client, ctx);
      const previousEnd = new Date(before[0].current_period_end);

      await finalize(client, ctx, "qa-event-downgrade-periodo");

      const { rows: after } = await subscriptionsOf(client, ctx);
      assert.equal(
        new Date(after[0].current_period_start).getTime(),
        previousEnd.getTime(),
        "el nuevo período arranca donde terminaba el anterior",
      );
      assert.ok(new Date(after[0].current_period_end).getTime() > previousEnd.getTime());
    });
  });
});

test("16. la organización conserva su plan hasta que el cambio se hace efectivo", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "plan_downgrade");
      await finalize(client, ctx, "qa-event-downgrade-org");

      const { rows } = await client.query(
        `SELECT plan_id FROM smarttalk.organizations WHERE id = $1`,
        [ctx.organization_id],
      );
      assert.equal(
        rows[0].plan_id,
        ctx.plan_b_id,
        "organizations.plan_id no debe bajar antes de tiempo",
      );

      const { rows: events } = await client.query(
        `SELECT reason, metadata FROM smarttalk.subscription_events WHERE organization_id = $1`,
        [ctx.organization_id],
      );
      assert.equal(events.length, 1);
      assert.equal(events[0].reason, "plan_downgrade_scheduled");
      assert.equal(events[0].metadata.downgrade_scheduled, true);
    });
  });
});

test("17. un upgrade posterior cancela el downgrade programado", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "plan_downgrade");
      await finalize(client, ctx, "qa-event-downgrade-previo");

      const { rows: scheduled } = await subscriptionsOf(client, ctx);
      assert.equal(scheduled[0].pending_plan_id, ctx.plan_a_id);

      // Segundo pago, esta vez al plan caro: es el camino normal (no downgrade),
      // así que debe limpiar el cambio pendiente.
      const second = await seed(client, "plan_change");
      await client.query(
        `UPDATE smarttalk.checkout_sessions SET organization_id = $1 WHERE id = $2`,
        [ctx.organization_id, second.checkout_session_id],
      );
      await client.query(
        `UPDATE smarttalk.payments SET organization_id = $1 WHERE id = $2`,
        [ctx.organization_id, second.payment_id],
      );
      await finalize(client, second, "qa-event-upgrade-posterior");

      const { rows: after } = await subscriptionsOf(client, ctx);
      assert.equal(after[0].pending_plan_id, null, "el upgrade debe cancelar el downgrade pendiente");
      assert.equal(after[0].change_effective_at, null);
    });
  });
});

// ===========================================================================
// 18. Deduplicación de la cola de canales (H-11)
// ===========================================================================

test("18. la cola de canales admite duplicados, pero el mensaje no se duplica", { skip }, async () => {
  await withClient(async (client) => {
    // (a) La cola NO deduplica en la entrada: `webhook_events` no tiene índice
    //     único sobre el payload ni sobre el id del proveedor.
    // La clave primaria también es un índice único, así que se excluye: lo que
    // interesa es si existe alguna unicidad *de negocio* sobre el evento.
    const { rows: queueIndexes } = await client.query(
      `SELECT i.indexname, i.indexdef
         FROM pg_indexes i
        WHERE i.schemaname = 'smarttalk' AND i.tablename = 'webhook_events'
          AND i.indexdef ILIKE '%UNIQUE%'
          AND i.indexname NOT IN (
            SELECT conname FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
             WHERE n.nspname = 'smarttalk' AND t.relname = 'webhook_events' AND c.contype = 'p'
          )`,
    );
    assert.deepEqual(
      queueIndexes.map((row) => row.indexname),
      [],
      "la cola ganó un índice único: revisa si la deduplicación en la entrada es intencional",
    );

    // (b) La protección real está aguas abajo: un mismo wa_message_id no puede
    //     repetirse dentro de una conversación.
    const { rows: messageIndexes } = await client.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'smarttalk' AND tablename = 'messages'
          AND indexname = 'uq_messages_conv_wa_message_id'`,
    );
    assert.equal(messageIndexes.length, 1, "falta uq_messages_conv_wa_message_id");
    assert.match(messageIndexes[0].indexdef, /UNIQUE/);
    assert.match(messageIndexes[0].indexdef, /conversation_id/);
    assert.match(messageIndexes[0].indexdef, /wa_message_id/);
    // Parcial: los mensajes salientes sin id de proveedor no se ven afectados.
    assert.match(messageIndexes[0].indexdef, /wa_message_id IS NOT NULL/);
  });
});

// ===========================================================================
// 19. Flujo controlado de recuperación de un webhook fallido
// ===========================================================================

test("19. el flujo controlado de recuperación activa sin duplicar la suscripción", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      // Escenario: la confirmación llegó, se registró el evento, pero la
      // activación falló (p. ej. contención en el RPC). Es el caso
      // `atomic_activation_failed` que el worker debe recuperar.
      const ctx = await seed(client, "suspended");

      const { rows: inserted } = await client.query(
        `INSERT INTO smarttalk.billing_webhook_events(
           provider, environment, event_key, payload_hash, signature_valid,
           status, attempt_count, last_error, payload)
         VALUES ('epayco', 'sandbox', $1, 'qa-hash', TRUE,
                 'failed', 1, 'atomic_activation_failed', $2::jsonb)
         RETURNING id, status, attempt_count`,
        [`QA-RECOVERY-${ctx.payment_id}`, JSON.stringify({ x_extra1: ctx.checkout_session_id })],
      );
      const eventId = inserted[0].id;
      assert.equal(inserted[0].status, "failed");

      // (a) La consulta del worker debe seleccionarlo: es exactamente el filtro
      //     de recoverFailedWebhookEvents (§33.1).
      const { rows: elegibles } = await client.query(
        `SELECT id FROM smarttalk.billing_webhook_events
          WHERE status = 'failed'
            AND signature_valid = TRUE
            AND attempt_count < 5
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
            AND id = $1`,
        [eventId],
      );
      assert.equal(elegibles.length, 1, "el worker no seleccionaría este evento");

      // (b) El claim con lease: UPDATE condicional sobre lease libre o vencido.
      const { rows: reclamado } = await client.query(
        `UPDATE smarttalk.billing_webhook_events
            SET locked_at = NOW(), locked_by = 'qa-worker-19'
          WHERE id = $1 AND status = 'failed'
            AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '120 seconds')
          RETURNING id`,
        [eventId],
      );
      assert.equal(reclamado.length, 1, "el claim con lease no funcionó");

      // Un segundo worker no puede reclamarlo mientras el lease esté vivo.
      const { rows: segundo } = await client.query(
        `UPDATE smarttalk.billing_webhook_events
            SET locked_at = NOW(), locked_by = 'qa-worker-19-bis'
          WHERE id = $1 AND status = 'failed'
            AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '120 seconds')
          RETURNING id`,
        [eventId],
      );
      assert.equal(segundo.length, 0, "dos workers reclamaron el mismo evento");

      // (c) La liquidación: el worker reejecuta el mismo RPC que el webhook.
      // Esta prueba valida los predicados, el lease y el RPC contra PostgreSQL;
      // no invoca el módulo del worker, por lo que no se presenta como una
      // prueba E2E de la función recoverFailedWebhookEvents.
      await finalize(client, ctx, `QA-RECOVERY-${ctx.payment_id}`);

      const { rows: subs } = await subscriptionsOf(client, ctx);
      assert.equal(subs.length, 1, "la recuperación no debe duplicar la suscripción");
      assert.equal(subs[0].status, "active", "la suscripción debía quedar activa");
      assert.equal(subs[0].suspended_at, null);

      // (d) Cierre del evento y liberación del lease.
      await client.query(
        `UPDATE smarttalk.billing_webhook_events
            SET status = 'processed', last_error = NULL, processed_at = NOW(),
                locked_at = NULL, locked_by = NULL
          WHERE id = $1`,
        [eventId],
      );
      const { rows: final } = await client.query(
        `SELECT status, last_error, locked_by FROM smarttalk.billing_webhook_events WHERE id = $1`,
        [eventId],
      );
      assert.equal(final[0].status, "processed");
      assert.equal(final[0].last_error, null);
      assert.equal(final[0].locked_by, null, "el lease debe liberarse al terminar");

      // (e) Y la auditoría que D-1 exige puede escribirse.
      await client.query(
        `INSERT INTO smarttalk.billing_audit_events(
           organization_id, actor_type, action, entity_type, entity_id,
           correlation_id, before_data, after_data, result)
         VALUES ($1, 'system', 'webhook_recovery_processed', 'billing_webhook_event', $2,
                 gen_random_uuid(), '{"status":"failed"}', '{"status":"processed"}', 'success')`,
        [ctx.organization_id, eventId],
      );
      const { rows: audit } = await client.query(
        `SELECT action, result FROM smarttalk.billing_audit_events WHERE entity_id = $1`,
        [eventId],
      );
      assert.equal(audit.length, 1);
      assert.equal(audit[0].result, "success");
    });
  });
});

test("13. un checkout expirado no puede activar una suscripción", { skip }, async () => {
  await withClient(async (client) => {
    await inRollback(client, async () => {
      const ctx = await seed(client, "suspended");
      await client.query(
        `UPDATE smarttalk.checkout_sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [ctx.checkout_session_id],
      );

      // El RPC lanza una EXCEPTION, que en PostgreSQL aborta la transacción
      // entera: sin un SAVEPOINT, cualquier consulta posterior falla con
      // 25P02 y no se podría comprobar el efecto.
      await client.query("SAVEPOINT antes_de_expirar");
      await assert.rejects(
        () => finalize(client, ctx, "qa-event-expirado"),
        /checkout_not_pending/,
      );
      await client.query("ROLLBACK TO SAVEPOINT antes_de_expirar");

      const { rows } = await subscriptionsOf(client, ctx);
      assert.equal(rows[0].status, "suspended", "la suscripción no debe activarse con checkout expirado");
    });
  });
});
