import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock del admin client de Supabase. Configuramos comportamiento por test.
const insertMock = vi.fn();
const countMock = vi.fn();
const oldestMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      insert: insertMock,
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) return { eq: () => ({ gte: () => countMock() }) };
        return {
          eq: () => ({
            gte: () => ({
              order: () => ({ limit: () => ({ maybeSingle: () => oldestMock() }) }),
            }),
          }),
        };
      },
    }),
  }),
}));

async function importRateLimit() {
  return await import("./rate-limit");
}

beforeEach(() => {
  vi.resetModules();
  insertMock.mockReset();
  countMock.mockReset();
  oldestMock.mockReset();
  delete process.env.RATE_LIMIT_WHITELIST;
});

describe("rateLimit (DB backend)", () => {
  it("permite dentro del límite", async () => {
    const { rateLimit } = await importRateLimit();
    insertMock.mockResolvedValue({ error: null });
    countMock.mockResolvedValue({ count: 3 });
    oldestMock.mockResolvedValue({ data: null });

    const result = await rateLimit("k1", 5, 60_000);
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("db");
    expect(result.remaining).toBe(2);
  });

  it("bloquea cuando supera el límite", async () => {
    const { rateLimit } = await importRateLimit();
    insertMock.mockResolvedValue({ error: null });
    countMock.mockResolvedValue({ count: 6 });
    oldestMock.mockResolvedValue({
      data: { hit_at: new Date(Date.now() - 10_000).toISOString() },
    });

    const result = await rateLimit("k2", 5, 60_000);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("fail-open a memoria cuando la DB tira error en insert", async () => {
    const { rateLimit } = await importRateLimit();
    insertMock.mockResolvedValue({ error: { message: "connection refused" } });

    const result = await rateLimit("k3", 5, 60_000);
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("memory-fallback");
  });

  it("memoria fallback también respeta límite entre calls", async () => {
    const { rateLimit } = await importRateLimit();
    insertMock.mockResolvedValue({ error: { message: "db down" } });

    // Primer request: ok
    const r1 = await rateLimit("k4", 2, 60_000);
    expect(r1.ok).toBe(true);
    // Segundo request: ok
    const r2 = await rateLimit("k4", 2, 60_000);
    expect(r2.ok).toBe(true);
    // Tercer: bloqueado
    const r3 = await rateLimit("k4", 2, 60_000);
    expect(r3.ok).toBe(false);
    expect(r3.backend).toBe("memory-fallback");
  });
});

describe("isWhitelistedIp", () => {
  it("false si RATE_LIMIT_WHITELIST no está seteado", async () => {
    const { isWhitelistedIp } = await importRateLimit();
    expect(isWhitelistedIp("1.2.3.4")).toBe(false);
  });

  it("true para IPs en la lista", async () => {
    process.env.RATE_LIMIT_WHITELIST = "1.2.3.4, 10.0.0.1";
    const { isWhitelistedIp } = await importRateLimit();
    expect(isWhitelistedIp("1.2.3.4")).toBe(true);
    expect(isWhitelistedIp("10.0.0.1")).toBe(true);
    expect(isWhitelistedIp("5.5.5.5")).toBe(false);
  });

  it("false para null/empty", async () => {
    process.env.RATE_LIMIT_WHITELIST = "1.2.3.4";
    const { isWhitelistedIp } = await importRateLimit();
    expect(isWhitelistedIp(null)).toBe(false);
    expect(isWhitelistedIp("")).toBe(false);
    expect(isWhitelistedIp(undefined)).toBe(false);
  });
});

describe("rateLimitWithWhitelist", () => {
  it("bypassea si el IP está whitelisted (sin insert)", async () => {
    process.env.RATE_LIMIT_WHITELIST = "9.9.9.9";
    const { rateLimitWithWhitelist } = await importRateLimit();

    const result = await rateLimitWithWhitelist("9.9.9.9", "login:9.9.9.9:x", 5, 60_000);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(5);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("delega a rateLimit cuando el IP no está whitelisted", async () => {
    const { rateLimitWithWhitelist } = await importRateLimit();
    insertMock.mockResolvedValue({ error: null });
    countMock.mockResolvedValue({ count: 1 });
    oldestMock.mockResolvedValue({ data: null });

    const result = await rateLimitWithWhitelist("5.5.5.5", "login:5.5.5.5:x", 5, 60_000);
    expect(result.ok).toBe(true);
    expect(insertMock).toHaveBeenCalled();
  });
});

describe("clientIp", () => {
  it("extrae del x-forwarded-for", async () => {
    const { clientIp } = await importRateLimit();
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientIp(headers)).toBe("1.1.1.1");
  });
  it("fallback a x-real-ip", async () => {
    const { clientIp } = await importRateLimit();
    const headers = new Headers({ "x-real-ip": "3.3.3.3" });
    expect(clientIp(headers)).toBe("3.3.3.3");
  });
  it('devuelve "unknown" si no hay headers', async () => {
    const { clientIp } = await importRateLimit();
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
