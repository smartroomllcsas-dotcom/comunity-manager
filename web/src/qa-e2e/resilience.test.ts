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
