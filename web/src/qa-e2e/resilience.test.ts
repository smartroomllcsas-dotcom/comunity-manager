// E2E QA · Resiliencia: timeouts de proveedores, política de reintentos y
// degradación del rate limiter.
//
// El bloque de timeouts es un TRINQUETE: congela el inventario de módulos de
// servidor que hoy hacen `fetch` sin `AbortSignal.timeout`/`AbortController`.
// Añadir un módulo nuevo sin timeout rompe la prueba; corregir uno existente la
// mantiene verde. No pretende que el inventario actual sea correcto — es el
// pendiente P2 de la auditoría, medido para que no crezca.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { outboxRetryDelaySeconds } from "@/lib/billing/outbox";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** Módulos que se ejecutan en el servidor y hacen HTTP saliente. */
function serverModulesWithFetch() {
  return walk(SRC)
    .map((file) => ({ file: path.relative(SRC, file).split(path.sep).join("/"), source: readFileSync(file, "utf8") }))
    .filter(({ file }) => file.startsWith("lib/") || file.startsWith("app/api/"))
    .filter(({ source }) => /\bfetch\(/.test(source))
    .filter(({ source }) => !source.startsWith('"use client"') && !source.startsWith("'use client'"));
}

function hasTimeout(source: string) {
  return /AbortSignal\.timeout|AbortController/.test(source);
}

/**
 * Inventario congelado el 2026-08-10. Cada entrada es deuda conocida del
 * pendiente "timeout de proveedores".
 *
 * `lib/epayco/client.ts` entró aquí el 2026-08-10 (el trinquete detectó la
 * migración a ePayco Checkout v2, commit a960455) y SALIÓ el mismo día al
 * cerrarse H-01: sus dos llamadas ya usan AbortSignal.timeout.
 */
const KNOWN_WITHOUT_TIMEOUT = new Set([
  "app/api/ai/assist/route.ts",
  "app/api/approval/route.ts",
  "app/api/auth/local/route.ts",
  "app/api/channels/whatsapp/connect/route.ts",
  "app/api/reports/route.ts",
  "app/api/templates/sync/route.ts",
  "lib/ai/actions.ts",
  "lib/analytics/ga4.ts",
  "lib/analytics/linkedin.ts",
  "lib/analytics/meta.ts",
  "lib/analytics/threads.ts",
  "lib/analytics/tiktok.ts",
  "lib/auth.ts",
  "lib/chatbot/ai.ts",
  "lib/instagram.ts",
  "lib/local-query-client.ts",
  "lib/media/fal.ts",
  "lib/meta.ts",
  "lib/respond-io/api.ts",
  "lib/smarttalk/channel-error-alert.ts",
  "lib/smarttalk/dead-letter-alert.ts",
  "lib/smarttalk/meta-webhook.ts",
  "lib/smarttalk/token-expiry-alert.ts",
  "lib/whatsapp-cm.ts",
  "lib/whatsapp/api.ts",
  "lib/whatsapp/token-manager.ts",
]);

describe("Resiliencia · timeout en llamadas salientes", () => {
  it("ningún módulo de servidor NUEVO hace fetch sin timeout", () => {
    const offenders = serverModulesWithFetch()
      .filter(({ source }) => !hasTimeout(source))
      .map(({ file }) => file)
      .filter((file) => !KNOWN_WITHOUT_TIMEOUT.has(file));

    expect(offenders, `Añade AbortSignal.timeout a: ${offenders.join(", ")}`).toEqual([]);
  });

  it("los módulos de publicación social mantienen su timeout explícito", () => {
    const social = serverModulesWithFetch().filter(({ file }) => file.startsWith("lib/social/"));
    expect(social.length).toBeGreaterThan(0);
    for (const entry of social) {
      expect(hasTimeout(entry.source), `${entry.file} perdió su timeout`).toBe(true);
    }
  });

  it("los despachadores de notificación mantienen su timeout explícito", () => {
    const notify = serverModulesWithFetch().filter(({ file }) => file.startsWith("lib/notify/"));
    expect(notify.length).toBeGreaterThan(0);
    for (const entry of notify) {
      expect(hasTimeout(entry.source), `${entry.file} perdió su timeout`).toBe(true);
    }
  });

  it("el inventario congelado no crece", () => {
    expect(KNOWN_WITHOUT_TIMEOUT.size).toBeLessThanOrEqual(26);
  });

  it("H-01 CERRADO: la ruta de cobro de ePayco declara timeout en sus dos llamadas", () => {
    const epayco = serverModulesWithFetch().find(({ file }) => file === "lib/epayco/client.ts");
    expect(epayco, "lib/epayco/client.ts ya no hace fetch: revisa H-01").toBeTruthy();
    expect(hasTimeout(epayco!.source)).toBe(true);

    // Un único `fetch` directo: el del envoltorio, que es quien pone la señal.
    // Las dos llamadas a la API pasan por él, así que no puede colarse una
    // llamada sin timeout.
    expect(epayco!.source.match(/\bawait fetch\(/g) || []).toHaveLength(1);
    expect(epayco!.source).toMatch(/AbortSignal\.timeout\(timeoutMs\)/);
    expect(epayco!.source.match(/await epaycoFetch\(/g) || []).toHaveLength(2);
  });
});

describe("Resiliencia · backoff de reintentos del outbox", () => {
  it("crece exponencialmente y satura en una hora", () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(outboxRetryDelaySeconds);
    expect(delays).toEqual([30, 60, 120, 240, 480, 960, 1920, 3600, 3600]);
    // Monotónico: ningún reintento espera menos que el anterior.
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it("los 5 intentos configurados cubren algo más de 15 minutos antes del dead letter", () => {
    const total = [0, 1, 2, 3, 4].reduce((sum, attempt) => sum + outboxRetryDelaySeconds(attempt), 0);
    expect(total).toBe(930);
  });
});

describe("H-09 · endurecimiento del límite degradado", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.resetModules();
    delete process.env.RATE_LIMIT_DEGRADED_DIVISOR;
  });

  function dbCaida() {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({ insert: async () => ({ error: { message: "connection refused" } }) }),
      }),
    }));
  }

  it("el divisor por defecto es 4 y se puede configurar", async () => {
    const { degradedLimitDivisor, degradedLimit } = await import("@/lib/rate-limit");
    expect(degradedLimitDivisor()).toBe(4);
    expect(degradedLimit(200)).toBe(50);
    expect(degradedLimit(10)).toBe(2);
  });

  it("el límite degradado nunca baja de 1, por bajo que sea el original", async () => {
    const { degradedLimit } = await import("@/lib/rate-limit");
    expect(degradedLimit(1)).toBe(1);
    expect(degradedLimit(2)).toBe(1);
    expect(degradedLimit(0)).toBe(1);
  });

  it("un divisor inválido no rompe: cae al valor por defecto", async () => {
    process.env.RATE_LIMIT_DEGRADED_DIVISOR = "no-es-numero";
    const { degradedLimitDivisor } = await import("@/lib/rate-limit");
    expect(degradedLimitDivisor()).toBe(4);
  });

  it("con la base caída aplica el límite reducido, no el original", async () => {
    dbCaida();
    const { rateLimit } = await import("@/lib/rate-limit");

    // Límite nominal 8 => degradado 2. La tercera petición debe rechazarse.
    const primera = await rateLimit("h09-reducido", 8, 60_000);
    const segunda = await rateLimit("h09-reducido", 8, 60_000);
    const tercera = await rateLimit("h09-reducido", 8, 60_000);

    expect(primera.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    // Con el comportamiento anterior esta habría pasado: el fallback usaba el
    // límite completo por worker.
    expect(tercera.ok).toBe(false);
    expect(tercera.backend).toBe("memory-fallback");
  });

  it("marca `degraded` para que el llamador pueda distinguirlo", async () => {
    dbCaida();
    const { rateLimit } = await import("@/lib/rate-limit");
    const resultado = await rateLimit("h09-flag", 4, 60_000);
    expect(resultado.degraded).toBe(true);
  });

  it("emite una línea estructurada al degradarse, para poder alertar", async () => {
    dbCaida();
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      const { rateLimit } = await import("@/lib/rate-limit");
      await rateLimit("h09-log", 40, 60_000);
    } finally {
      console.warn = original;
    }

    const line = lines.find((entry) => entry.includes("rate_limit.degraded"));
    expect(line, "no se emitió la línea de degradación").toBeTruthy();
    const payload = JSON.parse(line!.slice(line!.indexOf("{")));
    expect(payload).toMatchObject({
      event: "rate_limit.degraded",
      key: "h09-log",
      limit: 40,
      degradedLimit: 10,
    });
    expect(payload.reason).toBeTruthy();
  });

  it("con la base disponible NO se degrada ni se reduce el límite", async () => {
    const hits: Array<Record<string, unknown>> = [];
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          insert: async (row: Record<string, unknown>) => {
            hits.push(row);
            return { error: null };
          },
          select: () => ({ eq: () => ({ gte: () => Promise.resolve({ count: hits.length }) }) }),
        }),
      }),
    }));
    const { rateLimit } = await import("@/lib/rate-limit");

    const resultado = await rateLimit("h09-sano", 8, 60_000);
    expect(resultado).toMatchObject({ ok: true, backend: "db", degraded: false });
    // Con la base sana el margen se calcula sobre el límite completo.
    expect(resultado.remaining).toBe(7);
  });
});

describe("H-09 · purga de rate_limit_hits", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("borra sólo los hits fuera de la ventana de retención", async () => {
    let filtroAplicado: { column: string; value: string } | null = null;
    const borrados = [{ id: 1 }, { id: 2 }, { id: 3 }];
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          delete: () => ({
            lt: (column: string, value: string) => {
              filtroAplicado = { column, value };
              return { select: async () => ({ data: borrados, error: null }) };
            },
          }),
        }),
      }),
    }));

    const { purgeRateLimitHits, RATE_LIMIT_RETENTION_MS } = await import("@/lib/rate-limit");
    const antes = Date.now();
    const resultado = await purgeRateLimitHits();

    expect(resultado).toMatchObject({ ok: true, purged: 3 });
    expect(filtroAplicado!.column).toBe("hit_at");
    // El corte es "ahora menos la retención", no una fecha fija.
    const corte = new Date(filtroAplicado!.value).getTime();
    expect(corte).toBeLessThanOrEqual(antes - RATE_LIMIT_RETENTION_MS + 1000);
    expect(corte).toBeGreaterThan(antes - RATE_LIMIT_RETENTION_MS - 60_000);
  });

  it("un fallo de borrado se reporta, no se traga", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          delete: () => ({
            lt: () => ({ select: async () => ({ data: null, error: { message: "permission denied" } }) }),
          }),
        }),
      }),
    }));

    const { purgeRateLimitHits } = await import("@/lib/rate-limit");
    const resultado = await purgeRateLimitHits();
    expect(resultado.ok).toBe(false);
    expect(resultado).toHaveProperty("error", "permission denied");
  });

  it("la retención por defecto supera con holgura la ventana más larga en uso", async () => {
    const { RATE_LIMIT_RETENTION_MS } = await import("@/lib/rate-limit");
    // Las ventanas del proyecto son de 60 s; una hora deja margen de sobra.
    expect(RATE_LIMIT_RETENTION_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it("la purga NO se invoca desde rateLimit: no debe añadir consultas al camino caliente", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../lib/rate-limit.ts", import.meta.url).pathname,
      "utf8",
    );
    const rateLimitBody = source.slice(
      source.indexOf("export async function rateLimit("),
      source.indexOf("function memoryRateLimit("),
    );
    expect(rateLimitBody).not.toMatch(/purgeRateLimitHits/);
    expect(rateLimitBody).not.toMatch(/\.delete\(/);
  });
});

describe("Resiliencia · degradación del rate limiter", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  it("cae a un contador en memoria cuando la base no responde y lo reporta", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          insert: async () => ({ error: { message: "connection refused" } }),
        }),
      }),
    }));
    const { rateLimit } = await import("@/lib/rate-limit");

    const first = await rateLimit("qa-degradado", 2, 60_000);
    expect(first).toMatchObject({ ok: true, backend: "memory-fallback" });

    await rateLimit("qa-degradado", 2, 60_000);
    const blocked = await rateLimit("qa-degradado", 2, 60_000);

    // Fail-open documentado: sigue limitando, pero por worker y no de forma
    // global. Es el hallazgo abierto sobre serverless multi-instancia.
    expect(blocked.ok).toBe(false);
    expect(blocked.backend).toBe("memory-fallback");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("con la base disponible cuenta contra la ventana persistida", async () => {
    const hits: Array<Record<string, unknown>> = [];
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({
          insert: async (row: Record<string, unknown>) => {
            hits.push(row);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve({ count: hits.length, error: null }),
            }),
          }),
        }),
      }),
    }));
    const { rateLimit } = await import("@/lib/rate-limit");

    const result = await rateLimit("qa-db", 5, 60_000);
    expect(result).toMatchObject({ ok: true, backend: "db" });
    expect(hits).toHaveLength(1);
    expect(hits[0].key).toBe("qa-db");
  });
});
