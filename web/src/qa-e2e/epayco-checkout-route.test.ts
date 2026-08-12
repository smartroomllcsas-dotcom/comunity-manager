// E2E QA · POST /api/epayco/checkout — cierre de H-01, H-02 y H-03.
//
// Ejercita la RUTA REAL contra el Supabase en memoria y un `fetch` global
// sustituido por un doble. Nunca se contacta a ePayco: la URL de la API no se
// resuelve en ningún momento.
//
//   H-01 timeout  -> 504 controlado y la sesión pendiente queda `failed`
//   H-02 rate     -> 429 con Retry-After al superar 10/min por usuario
//   H-03 idempot. -> misma clave => misma sesión; conflicto controlado; carrera
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FakeSupabase } from "./helpers/fake-supabase";
import { createFakeSupabase } from "./helpers/fake-supabase";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY = "qa-public-key";
  process.env.EPAYCO_PRIVATE_KEY = "qa-private-key";
  process.env.EPAYCO_CUSTOMER_ID = "qa-cust-id";
  process.env.EPAYCO_P_KEY = "qa-p-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://qa.example.test";
  process.env.EPAYCO_TEST = "true";
  // Timeout corto: la prueba de H-01 no debe tardar 15 s.
  process.env.EPAYCO_HTTP_TIMEOUT_MS = "40";
});

const H = vi.hoisted(() => ({ current: null as FakeSupabase | null }));
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => H.current!.admin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => H.current!.server }));

import { POST as checkout } from "@/app/api/epayco/checkout/route";

const AGENT = { id: "user-admin", organization_id: "org-qa", email: "admin@example.invalid", name: "QA Admin", role: "admin" };

type FetchMode = "ok" | "timeout" | "network-error" | "http-500" | "no-session-id";
let fetchMode: FetchMode = "ok";
let fetchCalls: string[] = [];
const originalFetch = globalThis.fetch;

/**
 * Doble de la API de ePayco.
 *
 * El modo `timeout` no resuelve nunca: sólo rechaza cuando el `AbortSignal`
 * que pone `epaycoFetch` se dispara, que es exactamente lo que ocurre con un
 * proveedor colgado.
 */
function installFetchDouble() {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    fetchCalls.push(href);

    if (fetchMode === "timeout") {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // sin señal quedaría colgado: el test fallaría por timeout
        signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted due to timeout");
          error.name = "TimeoutError";
          reject(error);
        });
      });
    }
    if (fetchMode === "network-error") throw new Error("ECONNREFUSED");
    if (fetchMode === "http-500") {
      return new Response("upstream boom", { status: 500 });
    }
    if (href.endsWith("/login")) {
      return new Response(JSON.stringify({ token: "qa-token" }), { status: 200 });
    }
    if (fetchMode === "no-session-id") {
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { sessionId: "epayco-session-1" } }), { status: 200 });
  }) as typeof fetch;
}

function seed(overrides: { agents?: Record<string, unknown>[]; sessions?: Record<string, unknown>[] } = {}) {
  H.current = createFakeSupabase({
    currentUserId: "user-admin",
    // Índice único de la migración 010: serializa las peticiones concurrentes.
    uniqueIndexes: {
      checkout_sessions: [["organization_id", "idempotency_key"]],
    },
    tables: {
      agents: overrides.agents ?? [AGENT],
      plans: [{ id: "plan-1", name: "Demo Inicial", status: "active" }],
      plan_prices: [
        {
          id: "pp-1", plan_id: "plan-1", currency: "COP", amount_minor: 5_900_000,
          billing_interval: "month", interval_count: 1, provider: "epayco",
          is_active: true, active_from: "2020-01-01T00:00:00.000Z", active_to: null,
        },
      ],
      organizations: [{ id: "org-qa", name: "QA Agencia", plan_id: null, billing_phone: "3001112233" }],
      checkout_sessions: overrides.sessions ?? [],
      rate_limit_hits: [],
    },
  });
}

function makeRequest(key: string | null, body: Record<string, unknown> = { planId: "plan-1", currency: "COP" }) {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "idempotency-key" ? key : null) },
    json: async () => body,
  } as unknown as Parameters<typeof checkout>[0];
}

const sessions = () => H.current!.store.checkout_sessions as Array<Record<string, unknown>>;

beforeEach(() => {
  fetchMode = "ok";
  fetchCalls = [];
  installFetchDouble();
  seed();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// H-01 · Timeout de la pasarela
// ---------------------------------------------------------------------------

describe("H-01 · timeout de ePayco", () => {
  it("devuelve 504 controlado cuando /login no responde", async () => {
    fetchMode = "timeout";
    const res = await checkout(makeRequest("key-timeout-login"));

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.code).toBe("EPAYCO_TIMEOUT");
    expect(body.step).toBe("login");
    expect(body.error).toMatch(/no respondió a tiempo/i);
  });

  it("la sesión pendiente queda `failed` y no huérfana tras el timeout", async () => {
    fetchMode = "timeout";
    await checkout(makeRequest("key-timeout-cleanup"));

    expect(sessions()).toHaveLength(1);
    expect(sessions()[0].status).toBe("failed");
    expect(sessions()[0].completed_at).toBeTruthy();
  });

  it("el timeout se resuelve en el plazo configurado, no cuelga la petición", async () => {
    fetchMode = "timeout";
    const started = Date.now();
    const res = await checkout(makeRequest("key-timeout-plazo"));
    const elapsed = Date.now() - started;

    expect(res.status).toBe(504);
    // EPAYCO_HTTP_TIMEOUT_MS = 40 ms; margen amplio para CI lento.
    expect(elapsed).toBeLessThan(3_000);
  });

  it("una caída de red devuelve 502, no 500 genérico", async () => {
    fetchMode = "network-error";
    const res = await checkout(makeRequest("key-red"));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("EPAYCO_UNAVAILABLE");
  });

  it("un 500 del proveedor se traduce a 502 con el paso que falló", async () => {
    fetchMode = "http-500";
    const res = await checkout(makeRequest("key-http500"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("EPAYCO_HTTP_ERROR");
    expect(body.step).toBe("login");
  });

  it("una respuesta sin sessionId se reporta como respuesta inválida, no como éxito", async () => {
    fetchMode = "no-session-id";
    const res = await checkout(makeRequest("key-sin-session"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("EPAYCO_INVALID_RESPONSE");
    expect(body.step).toBe("session_create");
  });

  it("el camino feliz sigue funcionando y llama a los dos endpoints", async () => {
    const res = await checkout(makeRequest("key-ok"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe("epayco-session-1");
    expect(body.test).toBe(true);
    expect(fetchCalls.some((url) => url.endsWith("/login"))).toBe(true);
    expect(fetchCalls.some((url) => url.endsWith("/payment/session/create"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H-02 · Rate limiting
// ---------------------------------------------------------------------------

describe("H-02 · rate limiting", () => {
  it("responde 429 con Retry-After al superar el límite de 10/min por usuario", async () => {
    const responses: Response[] = [];
    for (let i = 0; i < 12; i++) {
      responses.push(await checkout(makeRequest(`key-rate-${i}`)));
    }

    const blocked = responses.filter((response) => response.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].headers.get("Retry-After")).toBeTruthy();
    expect((await blocked[0].json()).code).toBe("RATE_LIMITED");
  });

  it("el rechazo por límite ocurre antes de contactar a ePayco", async () => {
    for (let i = 0; i < 11; i++) await checkout(makeRequest(`key-antes-${i}`));
    const callsBefore = fetchCalls.length;

    const res = await checkout(makeRequest("key-antes-extra"));
    expect(res.status).toBe(429);
    expect(fetchCalls.length).toBe(callsBefore);
  });

  it("el cupo se cuenta por usuario, con la clave de billing checkout", async () => {
    await checkout(makeRequest("key-cupo"));
    const hits = H.current!.store.rate_limit_hits as Array<Record<string, unknown>>;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.key === "billing-checkout:user-admin")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H-03 · Idempotencia
// ---------------------------------------------------------------------------

describe("H-03 · idempotencia", () => {
  it("exige la Idempotency-Key del cliente", async () => {
    const res = await checkout(makeRequest(null));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(sessions()).toHaveLength(0);
  });

  it("rechaza una clave desproporcionadamente larga", async () => {
    const res = await checkout(makeRequest("k".repeat(201)));
    expect(res.status).toBe(400);
    expect(sessions()).toHaveLength(0);
  });

  it("persiste la clave del cliente, no una generada en el servidor", async () => {
    await checkout(makeRequest("clave-del-cliente"));
    expect(sessions()).toHaveLength(1);
    expect(sessions()[0].idempotency_key).toBe("clave-del-cliente");
  });

  it("dos peticiones con la misma clave devuelven la MISMA sesión y no duplican filas", async () => {
    const first = await checkout(makeRequest("clave-repetida"));
    const second = await checkout(makeRequest("clave-repetida"));

    const bodyA = await first.json();
    const bodyB = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(bodyB.checkoutSessionId).toBe(bodyA.checkoutSessionId);
    expect(bodyB.reused).toBe(true);
    expect(sessions()).toHaveLength(1);
  });

  it("reutilizar la clave con otro plan devuelve conflicto controlado", async () => {
    (H.current!.store.plans as Array<Record<string, unknown>>).push({
      id: "plan-2", name: "Demo Crecimiento", status: "active",
    });
    (H.current!.store.plan_prices as Array<Record<string, unknown>>).push({
      id: "pp-2", plan_id: "plan-2", currency: "COP", amount_minor: 14_900_000,
      billing_interval: "month", interval_count: 1, provider: "epayco",
      is_active: true, active_from: "2020-01-01T00:00:00.000Z", active_to: null,
    });

    await checkout(makeRequest("clave-cruzada", { planId: "plan-1", currency: "COP" }));
    const res = await checkout(makeRequest("clave-cruzada", { planId: "plan-2", currency: "COP" }));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("IDEMPOTENCY_CONFLICT");
    expect(sessions()).toHaveLength(1);
  });

  it("una clave ya consumida devuelve conflicto en lugar de revivir el pago", async () => {
    await checkout(makeRequest("clave-consumida"));
    // El pago se aprobó: la sesión ya no está `pending`.
    sessions()[0].status = "approved";

    const res = await checkout(makeRequest("clave-consumida"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("IDEMPOTENCY_KEY_CONSUMED");
    expect(body.status).toBe("approved");
    expect(sessions()).toHaveLength(1);
  });

  it("una sesión expirada con la misma clave no se reutiliza", async () => {
    await checkout(makeRequest("clave-expirada"));
    sessions()[0].expires_at = new Date(Date.now() - 1000).toISOString();

    const res = await checkout(makeRequest("clave-expirada"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("IDEMPOTENCY_KEY_CONSUMED");
  });

  it("dos peticiones CONCURRENTES con la misma clave crean una sola sesión", async () => {
    const [first, second] = await Promise.all([
      checkout(makeRequest("clave-concurrente")),
      checkout(makeRequest("clave-concurrente")),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const bodyA = await first.json();
    const bodyB = await second.json();
    expect(bodyB.checkoutSessionId).toBe(bodyA.checkoutSessionId);

    // El índice único (organization_id, idempotency_key) serializa la carrera:
    // la perdedora adopta la fila de la ganadora en vez de insertar otra.
    expect(sessions()).toHaveLength(1);
  });

  it("cinco peticiones concurrentes siguen produciendo una sola sesión", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => checkout(makeRequest("clave-rafaga"))),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);

    const ids = new Set(await Promise.all(responses.map(async (r) => (await r.json()).checkoutSessionId)));
    expect(ids.size).toBe(1);
    expect(sessions()).toHaveLength(1);
  });

  it("claves distintas sí crean sesiones distintas", async () => {
    await checkout(makeRequest("clave-a"));
    await checkout(makeRequest("clave-b"));
    expect(sessions()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Guardas previas que deben seguir en pie
// ---------------------------------------------------------------------------

describe("Guardas de autorización", () => {
  it("401 sin sesión", async () => {
    H.current!.server.auth.getUser = async () => ({ data: { user: null } });
    const res = await checkout(makeRequest("key-anon"));
    expect(res.status).toBe(401);
    expect(fetchCalls).toHaveLength(0);
  });

  it("403 si el agente no es administrador", async () => {
    seed({ agents: [{ ...AGENT, role: "agent" }] });
    const res = await checkout(makeRequest("key-no-admin"));
    expect(res.status).toBe(403);
    expect(sessions()).toHaveLength(0);
  });

  it("404 si el plan no está activo", async () => {
    (H.current!.store.plans as Array<Record<string, unknown>>)[0].status = "draft";
    const res = await checkout(makeRequest("key-plan-inactivo"));
    expect(res.status).toBe(404);
  });
});
