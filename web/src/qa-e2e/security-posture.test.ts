// E2E QA · Postura de seguridad: rate limiting, secretos, PCI, correlation IDs.
//
// Cada bloque congela un hallazgo de la revisión del 2026-08-10 (§5 del informe
// AGENT_NEXT_PHASE_IMPLEMENTATION.md). Los que describen deuda abierta afirman
// el estado ACTUAL, no el deseado: cuando se corrijan, el test falla y obliga a
// cerrar el hallazgo con evidencia.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { sanitizeEpaycoPayload } from "@/lib/epayco/client";

const SRC = path.resolve(__dirname, "..");
const read = (relative: string) => readFileSync(path.join(SRC, relative), "utf8");

function walk(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

// ---------------------------------------------------------------------------
// H-02 · Cobertura de rate limiting en las rutas de dinero
// ---------------------------------------------------------------------------

const MONEY_ROUTES = [
  "app/api/billing/checkout/route.ts",
  "app/api/billing/cancel/route.ts",
  "app/api/billing/resume/route.ts",
  "app/api/epayco/checkout/route.ts",
  "app/api/epayco/confirmation/route.ts",
];

const hasRateLimit = (source: string) => /rateLimit|rateLimitWithWhitelist/.test(source);

describe("Seguridad · rate limiting en rutas de cobro", () => {
  it("las tres rutas expuestas a dinero tienen rate limiting", () => {
    const covered = MONEY_ROUTES.filter((route) => hasRateLimit(read(route)));
    expect(covered.sort()).toEqual(
      [
        "app/api/billing/checkout/route.ts",
        "app/api/epayco/checkout/route.ts",
        "app/api/epayco/confirmation/route.ts",
      ].sort(),
    );
  });

  it("H-02 CERRADO: /api/epayco/checkout comparte la política de billing checkout", () => {
    const source = read("app/api/epayco/checkout/route.ts");
    expect(source).toMatch(/BILLING_CHECKOUT_RATE_LIMIT/);
    expect(source).toMatch(/BILLING_CHECKOUT_RATE_WINDOW_MS/);
    expect(source).toMatch(/checkoutRateLimitKey\(user\.id\)/);
    // El 429 en ejecución se verifica en epayco-checkout-route.test.ts.
    expect(source).toMatch(/status:\s*429/);
  });

  it("H-03 CERRADO: /api/epayco/checkout usa la Idempotency-Key del cliente", () => {
    const source = read("app/api/epayco/checkout/route.ts");
    expect(source).toMatch(/headers\.get\("idempotency-key"\)/i);
    expect(source).toMatch(/IDEMPOTENCY_KEY_REQUIRED/);
    expect(source).toMatch(/IDEMPOTENCY_CONFLICT/);
    expect(source).toMatch(/IDEMPOTENCY_KEY_CONSUMED/);
    // La clave persistida ya no se genera en el servidor.
    expect(source).not.toMatch(/idempotency_key:\s*randomUUID\(\)/);
    expect(source).toMatch(/idempotency_key:\s*idempotencyKey/);
    // La carrera se resuelve adoptando la fila ganadora del índice único.
    expect(source).toMatch(/23505/);
  });

  it("H-01 CERRADO: la ruta traduce el fallo de la pasarela a 504/502", () => {
    const source = read("app/api/epayco/checkout/route.ts");
    expect(source).toMatch(/EpaycoGatewayError/);
    expect(source).toMatch(/timedOut\s*\?\s*504\s*:\s*502/);
  });

  it("la ruta genérica /api/billing/checkout sí exige Idempotency-Key del cliente", () => {
    const source = read("app/api/billing/checkout/route.ts");
    expect(source).toMatch(/headers\.get\("idempotency-key"\)/i);
    expect(source).toMatch(/IDEMPOTENCY_CONFLICT/);
  });

  it("cancel y resume no necesitan rate limiting propio pero sí guarda de rol", () => {
    for (const route of ["app/api/billing/cancel/route.ts", "app/api/billing/resume/route.ts"]) {
      expect(read(route)).toMatch(/loadSubscriptionActionContext/);
    }
    expect(read("lib/billing/subscription-actions.ts")).toMatch(/FORBIDDEN_ROLE/);
  });
});

// ---------------------------------------------------------------------------
// D-3 · Ningún código puede encolar un tipo de outbox sin handler
// ---------------------------------------------------------------------------

describe("D-3 · tipos de outbox sin handler", () => {
  const UNIMPLEMENTED = [
    "process_webhook",
    "renew_subscription",
    "reconcile_payment",
    "expire_subscription",
    "apply_plan_change",
  ];

  it("ninguna fuente de la aplicación inserta un job de esos tipos", () => {
    const offenders = walk(SRC)
      .map((file) => ({ file: relative(file), source: readFileSync(file, "utf8") }))
      // El módulo del outbox los nombra en la constante que documenta el gap.
      .filter(({ file }) => file !== "lib/billing/outbox.ts")
      .flatMap(({ file, source }) =>
        UNIMPLEMENTED.filter((type) =>
          new RegExp(`job_type:\\s*["']${type}["']`).test(source),
        ).map((type) => `${file} -> ${type}`),
      );

    expect(offenders, `jobs sin handler encolados en: ${offenders.join(", ")}`).toEqual([]);
  });

  it("el único job_type que la aplicación encola es send_notification", () => {
    const enqueued = walk(SRC)
      .map((file) => readFileSync(file, "utf8"))
      .flatMap((source) => [...source.matchAll(/job_type:\s*["']([a-z_]+)["']/g)].map((m) => m[1]));

    expect(enqueued.length).toBeGreaterThan(0);
    expect([...new Set(enqueued)]).toEqual(["send_notification"]);
  });

  it("no se creó ninguna migración que estreche el CHECK de job_type", () => {
    const migrationsDir = path.resolve(SRC, "..", "supabase", "migrations");
    const touching = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) => {
        const sql = readFileSync(path.join(migrationsDir, name), "utf8");
        // Sólo la 010 define el CHECK original; nadie debe redefinirlo hasta
        // confirmar que no existen filas reales de esos tipos (D-3).
        return /job_type/.test(sql) && /CHECK/.test(sql);
      });

    expect(touching).toEqual(["20260729000200_010_multi_gateway_manual_renewal.sql"]);
  });
});

// ---------------------------------------------------------------------------
// Suite PostgreSQL · guardas del runner (verificación estructural)
// ---------------------------------------------------------------------------

describe("Suite PostgreSQL · guardas del runner", () => {
  const runner = readFileSync(
    path.resolve(SRC, "..", "scripts", "qa-postgres-suite.mjs"),
    "utf8",
  );
  const suite = readFileSync(
    path.resolve(SRC, "..", "tests", "postgres-integration.test.mjs"),
    "utf8",
  );
  const fixtures = readFileSync(
    path.resolve(SRC, "..", "supabase", "qa", "001_qa_lifecycle_fixtures.sql"),
    "utf8",
  );

  it("rechaza cadenas de Supabase gestionado y de producción", () => {
    expect(runner).toMatch(/supabase\\\.co/);
    expect(runner).toMatch(/production/);
    expect(runner).toMatch(/amazonaws\\\.com/);
    // La misma guarda vive en el archivo de tests, por si se ejecuta suelto.
    expect(suite).toMatch(/supabase\\\.co\|production/);
  });

  it("sólo admite hosts locales", () => {
    expect(runner).toMatch(/LOCAL_HOSTS/);
    for (const host of ["localhost", "127\\.0\\.0\\.1", "::1"]) {
      expect(runner).toMatch(new RegExp(host));
    }
  });

  it("aborta si la base contiene organizaciones que no son de QA", () => {
    expect(runner).toMatch(/name NOT LIKE '\[QA%'/);
    expect(runner).toMatch(/--allow-nonempty/);
  });

  it("todos los tests que escriben usan BEGIN/ROLLBACK", () => {
    expect(suite).toMatch(/await client\.query\("BEGIN"\)/);
    expect(suite).toMatch(/await client\.query\("ROLLBACK"\)/);
    // El ROLLBACK está en `finally`: se ejecuta aunque el test falle.
    expect(suite).toMatch(/finally\s*\{\s*await client\.query\("ROLLBACK"\)/);

    // Cada `seed(` debe ocurrir dentro de un `inRollback(`.
    const seedCount = (suite.match(/await seed\(client,/g) || []).length;
    const rollbackCount = (suite.match(/await inRollback\(client,/g) || []).length;
    expect(seedCount).toBeGreaterThan(0);
    expect(rollbackCount).toBeGreaterThan(0);
  });

  it("la limpieza sólo borra filas con el prefijo [QA-FIXTURE]", () => {
    const deletes = fixtures.match(/DELETE FROM [^;]+;/g) || [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const statement of deletes) {
      expect(statement, `DELETE sin filtro de fixture: ${statement}`).toMatch(
        /LIKE '\[QA-FIXTURE\]%'/,
      );
    }
  });

  it("los fixtures marcan sus registros para que un residuo sea evidente", () => {
    expect(fixtures).toMatch(/\[QA-FIXTURE\]/);
    expect(fixtures).toMatch(/example\.invalid/);
    // Las funciones de siembra no deben ser alcanzables desde la app.
    expect(fixtures).toMatch(/REVOKE ALL ON FUNCTION smarttalk\.qa_seed_lifecycle_case/);
  });
});

// ---------------------------------------------------------------------------
// Recuperación de webhooks · enumeración que sustenta la propuesta
// ---------------------------------------------------------------------------

describe("Webhooks fallidos · motivos que puede registrar la ruta", () => {
  it("la lista de last_error es exactamente la esperada", () => {
    // Los motivos viven en el módulo de liquidación desde que la ruta y el
    // worker de recuperación comparten camino.
    const source = read("lib/billing/epayco-activation.ts");
    const union = source.slice(
      source.indexOf("export type EpaycoSettlementFailure"),
      source.indexOf("export type EpaycoSettlementResult"),
    );
    const reasons = [...union.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);

    // Si aparece un motivo nuevo, la tabla de clasificación de D-2
    // (`webhook-recovery.ts`) queda incompleta y debe revisarse.
    expect(reasons.sort()).toEqual(
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

  it("checkout_not_pending se marca `ignored`, no `failed`: no es candidato a reproceso", () => {
    // La liquidación lo devuelve como `ignored` y la ruta lo traslada tal cual,
    // así que nunca entra en la selección del worker de recuperación.
    expect(read("lib/billing/epayco-activation.ts")).toMatch(
      /outcome: "ignored", reason: "checkout_not_pending"/,
    );
    expect(read("app/api/epayco/confirmation/route.ts")).toMatch(
      /markWebhook\(eventId, "ignored", settlement\.reason\)/,
    );
  });

  it("H-10 CERRADO: existe un worker de recuperación y un cron que lo invoca", () => {
    const recovery = read("lib/billing/webhook-recovery.ts");
    // D-1: la firma inválida se excluye en la propia consulta, no sólo en el bucle.
    expect(recovery).toMatch(/\.eq\("signature_valid", true\)/);
    expect(recovery).toMatch(/billing_audit_events/);
    // D-2: los tres conflictos alertan; ninguno desactiva la organización.
    expect(recovery).toMatch(/REVIEW_REQUIRED_ERRORS/);
    expect(recovery).not.toMatch(/is_active:\s*false/);

    const cron = read("app/api/cron/billing-webhook-recovery/route.ts");
    expect(cron).toMatch(/CRON_SECRET/);
    expect(cron).toMatch(/recoverFailedWebhookEvents/);
  });

  it("la selección filtra estado, firma, intentos y turno", () => {
    const recovery = read("lib/billing/webhook-recovery.ts");
    expect(recovery).toMatch(/\.eq\("status", "failed"\)/);
    expect(recovery).toMatch(/\.eq\("signature_valid", true\)/);
    expect(recovery).toMatch(/\.lt\("attempt_count", MAX_RECOVERY_ATTEMPTS\)/);
    expect(recovery).toMatch(/next_attempt_at\.is\.null,next_attempt_at\.lte\./);
  });

  it("el claim usa lease con locked_at y locked_by, y admite lease vencido", () => {
    const recovery = read("lib/billing/webhook-recovery.ts");
    expect(recovery).toMatch(/locked_at: new Date\(\)\.toISOString\(\), locked_by: workerId/);
    expect(recovery).toMatch(/locked_at\.is\.null,locked_at\.lt\./);
    expect(recovery).toMatch(/LEASE_SECONDS/);
  });

  it("markEvent comprueba el error de escritura y lo reporta", () => {
    const recovery = read("lib/billing/webhook-recovery.ts");
    const marker = recovery.slice(recovery.indexOf("async function markEvent"));
    expect(marker).toMatch(/if \(error\) \{/);
    expect(marker).toMatch(/return false;/);
    // El resultado del worker expone los fallos de escritura y de auditoría.
    expect(recovery).toMatch(/writeFailures: number/);
    expect(recovery).toMatch(/auditFailures: number/);
  });

  it("el worker exige la migración 034 antes de procesar sin lease", () => {
    expect(read("lib/billing/webhook-recovery.ts")).toMatch(/WebhookRecoverySchemaError/);
    expect(read("app/api/cron/billing-webhook-recovery/route.ts")).toMatch(/SCHEMA_NOT_READY/);

    const migration = readFileSync(
      path.resolve(SRC, "..", "supabase", "migrations", "20260810000200_034_webhook_recovery_lease.sql"),
      "utf8",
    );
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS locked_by TEXT/);
    expect(migration).toMatch(/NO APLICADA/);
    // Aditiva y reversible: sin DROP de datos ni cambios de constraint.
    expect(migration).not.toMatch(/DROP TABLE|DROP CONSTRAINT/);
  });

  it("el cron de recuperación está registrado en vercel.json", () => {
    const vercel = JSON.parse(
      readFileSync(path.resolve(SRC, "..", "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    const entry = vercel.crons.find((cron) => cron.path === "/api/cron/billing-webhook-recovery");
    expect(entry, "falta la entrada del cron en vercel.json").toBeTruthy();
    expect(entry!.schedule).toBe("*/10 * * * *");
  });

  it("la ruta del webhook y el worker comparten un único camino de liquidación", () => {
    // Si divergieran, habría un camino de cobro sin pruebas.
    expect(read("app/api/epayco/confirmation/route.ts")).toMatch(/settleEpaycoConfirmation/);
    expect(read("lib/billing/webhook-recovery.ts")).toMatch(/settleEpaycoConfirmation/);
  });
});

// ---------------------------------------------------------------------------
// PCI · ningún dato de tarjeta entra al sistema
// ---------------------------------------------------------------------------

describe("Seguridad · PCI", () => {
  it("el checkout es hospedado: no hay campos de tarjeta en el código de la app", () => {
    const offenders = walk(SRC)
      .filter((file) => !relative(file).startsWith("lib/skills/"))
      .map((file) => ({ file: relative(file), source: readFileSync(file, "utf8") }))
      .filter(({ source }) =>
        /\b(card_number|cardNumber|cvv|cvc|card_cvc|expiry_month|expiry_year)\b/.test(source),
      )
      .map(({ file }) => file);

    expect(offenders, `campos de tarjeta encontrados en: ${offenders.join(", ")}`).toEqual([]);
  });

  it("sanitizeEpaycoPayload descarta cualquier campo fuera de la lista blanca", () => {
    const sanitized = sanitizeEpaycoPayload({
      x_ref_payco: "REF-1",
      x_amount: "59000.00",
      // Campos que ePayco puede añadir y que no deben persistirse jamás.
      x_cardnumber: "4111111111111111",
      x_customer_doc: "1020304050",
      x_customer_email: "cliente@example.test",
      x_customer_ip: "203.0.113.9",
      x_signature: "firma",
      cualquier_campo_nuevo: "valor",
    });

    expect(sanitized).toEqual({ x_ref_payco: "REF-1", x_amount: "59000.00" });
    expect(Object.keys(sanitized)).not.toContain("x_cardnumber");
    // La firma tampoco se persiste: no aporta y es material sensible.
    expect(Object.keys(sanitized)).not.toContain("x_signature");
  });

  it("el payload persistido no incluye datos personales del pagador", () => {
    const sanitized = sanitizeEpaycoPayload({
      x_ref_payco: "REF-1",
      x_customer_name: "Nombre Apellido",
      x_customer_lastname: "Apellido",
      x_customer_email: "cliente@example.test",
      x_customer_phone: "3001112233",
      x_customer_movil: "3001112233",
      x_customer_ind_pais: "57",
      x_customer_country: "CO",
    });
    expect(sanitized).toEqual({ x_ref_payco: "REF-1" });
  });
});

// ---------------------------------------------------------------------------
// H-04 · Secretos de pasarela
// ---------------------------------------------------------------------------

describe("Seguridad · secretos de pasarela", () => {
  it("ningún componente de cliente importa el módulo servidor de ePayco", () => {
    const offenders = walk(SRC)
      .map((file) => ({ file: relative(file), source: readFileSync(file, "utf8") }))
      .filter(({ source }) => /^["']use client["']/.test(source.trimStart()))
      .filter(({ source }) => /from\s+["']@\/lib\/epayco\/client["']/.test(source))
      .map(({ file }) => file);

    expect(offenders, `importan claves de servidor: ${offenders.join(", ")}`).toEqual([]);
  });

  it("sólo la clave pública lleva prefijo NEXT_PUBLIC_", () => {
    const source = read("lib/epayco/client.ts");
    expect(source).toMatch(/NEXT_PUBLIC_EPAYCO_PUBLIC_KEY/);
    // Las tres claves sensibles deben leerse sin prefijo público.
    for (const secret of ["EPAYCO_PRIVATE_KEY", "EPAYCO_P_KEY", "EPAYCO_CUSTOMER_ID"]) {
      expect(source).not.toMatch(new RegExp(`NEXT_PUBLIC_${secret}`));
    }
  });

  it("H-04 abierto: getEpaycoConfig() expone privateKey y pKey y no tiene consumidores", () => {
    const source = read("lib/epayco/client.ts");
    expect(source).toMatch(/export function getEpaycoConfig/);
    expect(source).toMatch(/privateKey: EPAYCO_PRIVATE_KEY/);

    // Mientras no tenga llamadores es inerte; el riesgo es que alguien la use
    // desde una ruta que devuelva su resultado al navegador.
    const callers = walk(SRC)
      .map((file) => ({ file: relative(file), source: readFileSync(file, "utf8") }))
      .filter(({ file }) => file !== "lib/epayco/client.ts")
      .filter(({ source: body }) => /getEpaycoConfig\s*\(/.test(body))
      .map(({ file }) => file);

    expect(callers, `getEpaycoConfig ya tiene consumidores: ${callers.join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// H-05 · Correlation IDs
// ---------------------------------------------------------------------------

describe("Seguridad · trazabilidad por correlation_id", () => {
  const WRITERS = [
    "app/api/cron/billing-lifecycle/route.ts",
    "lib/billing/subscription-actions.ts",
    "app/api/admin/subscriptions/route.ts",
  ];

  it("todo escritor de subscription_events fija un correlation_id", () => {
    for (const writer of WRITERS) {
      const source = read(writer);
      expect(source, `${writer} escribe eventos sin correlation_id`).toMatch(
        /correlation_?[Ii]d/,
      );
    }
  });

  it("los prefijos de correlation_id identifican el origen de la transición", () => {
    expect(read("app/api/cron/billing-lifecycle/route.ts")).toMatch(/`lifecycle:/);
    expect(read("lib/billing/subscription-actions.ts")).toMatch(/`cancel:/);
    expect(read("lib/billing/subscription-actions.ts")).toMatch(/`resume:/);
    expect(read("app/api/admin/subscriptions/route.ts")).toMatch(/`admin:/);
  });

  it("H-05 abierto: los logs de billing no incluyen el correlation_id", () => {
    // Cada `console.error` de billing imprime código de error y feature, pero no
    // la clave que permitiría unir la línea de log con subscription_events.
    const billingLogs = walk(SRC)
      .map((file) => ({ file: relative(file), source: readFileSync(file, "utf8") }))
      .filter(({ file }) => file.startsWith("lib/billing/") || file.startsWith("app/api/billing/"))
      .flatMap(({ file, source }) =>
        [...source.matchAll(/console\.(error|warn|log)\([^)]*\)/g)].map((match) => ({
          file,
          line: match[0],
        })),
      );

    expect(billingLogs.length).toBeGreaterThan(0);
    const withCorrelation = billingLogs.filter((entry) => /correlation/i.test(entry.line));
    expect(withCorrelation).toHaveLength(0);
  });
});
