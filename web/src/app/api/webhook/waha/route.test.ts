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
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
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
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "waha",
        status: "pending",
      })
    );
  });
});
