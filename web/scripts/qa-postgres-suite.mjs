#!/usr/bin/env node
/**
 * Runner reproducible de la suite de integración PostgreSQL/RLS.
 *
 * Qué hace, en orden:
 *   1. Exige `QA_DATABASE_URL` y rechaza cadenas que parezcan gestionadas o
 *      productivas.
 *   2. Se conecta y verifica que la base es DESECHABLE (sin datos reales),
 *      salvo que se pase `--allow-nonempty` de forma explícita.
 *   3. Comprueba que las migraciones necesarias están aplicadas.
 *   4. Carga `supabase/qa/001_qa_lifecycle_fixtures.sql`.
 *   5. Ejecuta `tests/postgres-integration.test.mjs`.
 *   6. Corre la limpieza defensiva y reporta cualquier residuo.
 *
 * Uso:
 *   QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
 *     node scripts/qa-postgres-suite.mjs
 *
 * Nunca apuntes esta variable a Production ni al proyecto QA compartido.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");

const FIXTURES = path.join(webDir, "supabase", "qa", "001_qa_lifecycle_fixtures.sql");
const TEST_FILE = path.join(webDir, "tests", "postgres-integration.test.mjs");

const allowNonEmpty = process.argv.includes("--allow-nonempty");
/** Sólo comprueba prerrequisitos: no carga fixtures ni ejecuta las pruebas. */
const checkOnly = process.argv.includes("--check");
const connectionString = process.env.QA_DATABASE_URL;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function info(message) {
  console.log(`  ${message}`);
}

if (!connectionString) {
  fail(
    [
      "Falta QA_DATABASE_URL.",
      "",
      "Levanta una base desechable y vuelve a intentarlo. Por ejemplo:",
      "  supabase start        # expone Postgres en 127.0.0.1:54322",
      "  supabase db reset     # aplica supabase/migrations/ desde cero",
      "",
      "  QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \\",
      "    node scripts/qa-postgres-suite.mjs",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Guarda 1 — la cadena no puede parecer un entorno gestionado o productivo.
// ---------------------------------------------------------------------------
const FORBIDDEN = [/supabase\.co/i, /production/i, /\bprod\b/i, /prod\./i, /amazonaws\.com/i, /neon\.tech/i];
const matched = FORBIDDEN.find((pattern) => pattern.test(connectionString));
if (matched) {
  fail(
    `QA_DATABASE_URL coincide con ${matched} y parece un entorno gestionado o productivo.\n` +
      "Esta suite siembra datos: sólo puede correr contra una base desechable local.",
  );
}

const host = (() => {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "";
  }
})();
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal", "postgres", "db"]);
if (host && !LOCAL_HOSTS.has(host)) {
  fail(
    `El host '${host}' no es local. Para evitar accidentes, esta suite sólo acepta:\n  ${[...LOCAL_HOSTS].join(", ")}`,
  );
}

const { default: pg } = await import("pg");

const client = new pg.Client({ connectionString });
try {
  await client.connect();
} catch (error) {
  fail(`No se pudo conectar a QA_DATABASE_URL: ${error.message}`);
}

console.log("\n▸ Suite de integración PostgreSQL/RLS\n");
info(`host: ${host || "(desconocido)"}`);

let exitCode = 0;

try {
  // -------------------------------------------------------------------------
  // Guarda 2 — la base debe estar vacía de datos reales.
  // -------------------------------------------------------------------------
  const { rows: orgRows } = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE name NOT LIKE '[QA%')::int AS reales
       FROM smarttalk.organizations`,
  );
  info(`organizaciones en la base: ${orgRows[0].total} (no-QA: ${orgRows[0].reales})`);

  if (orgRows[0].reales > 0 && !allowNonEmpty) {
    fail(
      `La base contiene ${orgRows[0].reales} organizaciones que no son de QA.\n` +
        "Se aborta por seguridad. Si de verdad es una base desechable, repite con --allow-nonempty.",
    );
  }

  // -------------------------------------------------------------------------
  // Guarda 3 — migraciones necesarias aplicadas.
  // -------------------------------------------------------------------------
  const REQUIRED_FUNCTIONS = [
    "finalize_epayco_approved_payment",
    "reserve_billing_capacity",
    "record_billing_usage",
    "claim_billing_outbox_jobs",
  ];
  const { rows: functionRows } = await client.query(
    `SELECT p.proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'smarttalk' AND p.proname = ANY($1)`,
    [REQUIRED_FUNCTIONS],
  );
  const present = new Set(functionRows.map((row) => row.proname));
  const missing = REQUIRED_FUNCTIONS.filter((name) => !present.has(name));
  if (missing.length) {
    fail(
      `Faltan funciones de migración en la base: ${missing.join(", ")}.\n` +
        "Aplica supabase/migrations/ completo antes de correr la suite (supabase db reset).",
    );
  }
  info(`funciones de billing presentes: ${REQUIRED_FUNCTIONS.length}/${REQUIRED_FUNCTIONS.length}`);

  // ¿Está la 033 aplicada? Se reporta, no se exige.
  const { rows: defRows } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS body FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'smarttalk' AND p.proname = 'finalize_epayco_approved_payment'`,
  );
  const has033 = defRows.some((row) => /'cancelled'/.test(row.body) && /status IN \([^)]*cancelled/.test(row.body));
  info(`migración 033 (reactivación desde cancelled): ${has033 ? "APLICADA" : "NO aplicada"}`);

  // ¿Está la 035 aplicada? Se reporta, no se exige: las pruebas 14-17 la
  // necesitan, el resto no.
  const has035 = defRows.some((row) => /plan_downgrade_scheduled/.test(row.body));
  info(`migración 035 (downgrade programado): ${has035 ? "APLICADA" : "NO aplicada"}`);
  if (!has035) {
    info("  ⚠ sin la 035, las pruebas 14-17 fallarán: es el comportamiento esperado");
  }

  if (checkOnly) {
    console.log("\n▸ --check: prerrequisitos verificados, no se ejecutó nada.\n");
    await client.end();
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Paso 4 — cargar fixtures.
  // -------------------------------------------------------------------------
  const fixturesSql = readFileSync(FIXTURES, "utf8");
  await client.query(fixturesSql);
  info(`fixtures cargados desde ${path.relative(webDir, FIXTURES)}`);

  await client.end();

  // -------------------------------------------------------------------------
  // Paso 5 — ejecutar la suite.
  // -------------------------------------------------------------------------
  console.log("\n▸ Ejecutando tests/postgres-integration.test.mjs\n");
  const run = spawnSync(
    process.execPath,
    ["--test", "--experimental-strip-types", TEST_FILE],
    { cwd: webDir, stdio: "inherit", env: { ...process.env, QA_DATABASE_URL: connectionString, QA_PG_SUITE: "1" } },
  );
  exitCode = run.status ?? 1;
} catch (error) {
  console.error(`\n✖ ${error.message}\n`);
  exitCode = 1;
  try {
    await client.end();
  } catch {
    /* la conexión ya estaba cerrada */
  }
}

// ---------------------------------------------------------------------------
// Paso 6 — limpieza defensiva.
// ---------------------------------------------------------------------------
const cleanupClient = new pg.Client({ connectionString });
try {
  await cleanupClient.connect();
  const { rows } = await cleanupClient.query("SELECT * FROM smarttalk.qa_cleanup_fixtures()");
  const leftovers = rows.filter((row) => Number(row.deleted_rows) > 0);
  console.log("\n▸ Limpieza");
  if (leftovers.length === 0) {
    info("sin residuos: todos los ROLLBACK funcionaron");
  } else {
    for (const row of leftovers) {
      info(`residuo eliminado en ${row.deleted_table}: ${row.deleted_rows} fila(s)`);
    }
    console.log("\n  ⚠ Hubo residuos. Revisa si algún test escapó de su transacción.");
  }
} catch (error) {
  console.error(`  no se pudo ejecutar la limpieza: ${error.message}`);
} finally {
  await cleanupClient.end().catch(() => {});
}

console.log("");
process.exit(exitCode);
