import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { POST } from "./route";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  rateLimitWithWhitelist: vi.fn().mockResolvedValue({ ok: true }),
}));

const processRow = vi.fn();
vi.mock("@/lib/smarttalk/meta-webhook", () => ({
  processWebhookEventRow: (...args: unknown[]) => processRow(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────
const SECRET = "test-secret-xyz";
const BODY = JSON.stringify({ event: "message", data: { id: "1" } });

function makeHmac(body: string, secret: string) {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

function makeRequest(body: string, signature?: string) {
  return new Request("http://localhost/api/webhook/waha", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-webhook-hmac": signature } : {}),
    },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("POST /api/webhook/waha", () => {
  beforeEach(async () => {
    vi.resetModules();
    // Set required env var
    process.env.WAHA_WEBHOOK_HMAC_SECRET = SECRET;

    // Reset admin mock to default happy path
    const { createAdminClient } = await import("@/lib/supabase/admin");
    processRow.mockReset().mockResolvedValue({ ok: true, processed: 1 });
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: "evt-1" }, error: null }) }),
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: () => ({ eq: async () => ({ error: null }) }),
    });
    const fromMock = vi.fn().mockReturnValue({ insert: insertMock, update: updateMock });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: fromMock,
    });
  });

  it("returns 401 when x-webhook-hmac header is missing", async () => {
    const req = makeRequest(BODY); // no signature header
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 401 when x-webhook-hmac is wrong", async () => {
    const req = makeRequest(BODY, "deadbeef");
    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 200 and inserts event when HMAC is valid", async () => {
    const sig = makeHmac(BODY, SECRET);
    const req = makeRequest(BODY, sig);
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Assert insert was called with expected shape
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = (createAdminClient as ReturnType<typeof vi.fn>).mock.results[0].value;
    const insertCall = admin.from("webhook_events").insert;
    // Un "message" entrante se atiende en línea: se reclama como "processing"
    // y se procesa en la misma petición (respuesta del agente al instante).
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "waha",
        status: "processing",
      })
    );
    expect(processRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-1", channel: "waha" })
    );
  });

  it("queues (pending) events that are not handled inline, e.g. message.ack", async () => {
    const body = JSON.stringify({ event: "message.ack", payload: { id: "1" } });
    const res = await POST(makeRequest(body, makeHmac(body, SECRET)) as any);
    expect(res.status).toBe(200);
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = (createAdminClient as ReturnType<typeof vi.fn>).mock.results.at(-1)!.value;
    expect(admin.from("webhook_events").insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" })
    );
    expect(processRow).not.toHaveBeenCalled();
  });

  it("re-queues the event as pending when inline processing fails", async () => {
    processRow.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(makeRequest(BODY, makeHmac(BODY, SECRET)) as any);
    expect(res.status).toBe(200);
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = (createAdminClient as ReturnType<typeof vi.fn>).mock.results.at(-1)!.value;
    expect(admin.from("webhook_events").update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" })
    );
  });
});
