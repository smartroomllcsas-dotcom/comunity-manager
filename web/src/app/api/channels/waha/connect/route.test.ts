import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/smarttalk/brand-scope", () => ({
  getBrandInOrganization: vi.fn(),
  agentCanAccessBrand: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/billing/service", () => ({
  checkBillingFeature: vi.fn().mockResolvedValue({ allowed: true }),
  billingDeniedResponse: vi.fn(),
}));
vi.mock("@/lib/billing/features", () => ({
  BILLING_FEATURES: { CHANNELS_ACTIVE: "channels.active" },
}));
vi.mock("@/lib/waha/client", () => ({
  wahaFromEnv: vi.fn(),
  WahaError: class WahaError extends Error {
    status: number;
    body?: string;
    constructor(status: number, msg: string, body?: string) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));
vi.mock("@/lib/waha/session-name", () => ({
  sessionNameForBrand: vi.fn((brandId: string) => `brand-${brandId}`),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandInOrganization } from "@/lib/smarttalk/brand-scope";
import { checkBillingFeature } from "@/lib/billing/service";
import { wahaFromEnv } from "@/lib/waha/client";
import { POST } from "./route";

// ── helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/channels/waha/connect", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const FAKE_USER = { id: "user-1" };
const FAKE_AGENT = { id: "user-1", organization_id: "org-1", member_type: "admin" };
const FAKE_BRAND = { id: "brand-1", name: "Test Brand", smarttalk_organization_id: "org-1" };
const FAKE_CHANNEL = { id: "channel-uuid-1" };

function buildAdminMock({
  agentData = FAKE_AGENT,
  channelData = FAKE_CHANNEL,
  upsertError = null,
  channelInsertError = null,
}: {
  agentData?: typeof FAKE_AGENT | null;
  channelData?: typeof FAKE_CHANNEL | null;
  upsertError?: { message: string } | null;
  channelInsertError?: { message: string } | null;
} = {}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const adminMock = {
    from: vi.fn((table: string) => {
      if (table === "agents") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: agentData, error: null }),
        };
      }
      if (table === "channels") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: channelInsertError ? null : channelData,
            error: channelInsertError,
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "waha_sessions") {
        return {
          upsert: vi.fn().mockResolvedValue({ error: upsertError }),
          update: updateMock,
        };
      }
      return {};
    }),
  };
  return { adminMock, updateMock };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("POST /api/channels/waha/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WAHA_WEBHOOK_HMAC_SECRET = "test-hmac-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.comunitymanager.io";

    // Default: authenticated user
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: FAKE_USER } }),
      },
    } as never);

    vi.mocked(getBrandInOrganization).mockResolvedValue(FAKE_BRAND as never);
    vi.mocked(checkBillingFeature).mockResolvedValue({ allowed: true } as never);
  });

  // ── 1. 400 on missing brandId ──────────────────────────────────────────

  it("returns 400 when brandId is missing", async () => {
    const { adminMock } = buildAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/brandId/i);
  });

  // ── 2. 201 happy path ────────────────────────────────────────────────

  it("returns 201 with channelId, sessionName, status on success", async () => {
    const { adminMock } = buildAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);

    const createSessionMock = vi.fn().mockResolvedValue({ name: "brand-brand-1", status: "STARTING" });
    vi.mocked(wahaFromEnv).mockReturnValue({ createSession: createSessionMock } as never);

    const res = await POST(makeRequest({ brandId: "brand-1" }));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.channelId).toBe("channel-uuid-1");
    expect(json.sessionName).toBe("brand-brand-1");
    expect(json.status).toBe("STARTING");

    // Verify WAHA was called with correct args
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "brand-brand-1",
        webhookUrl: expect.stringContaining("/api/webhook/waha"),
        webhookHmacSecret: "test-hmac-secret",
      })
    );
  });

  // ── 3. 502 when WAHA fails ────────────────────────────────────────────

  it("returns 502 and deletes the orphan channel row on WAHA error", async () => {
    // #3 rollback: on WAHA failure we DELETE the channels row (CASCADE
    // cleans waha_sessions) so it doesn't count against billing quota.
    const channelDeleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const channelDeleteMock = vi.fn().mockReturnValue({ eq: channelDeleteEqMock });

    const adminMock = {
      from: vi.fn((table: string) => {
        if (table === "agents") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: FAKE_AGENT, error: null }),
          };
        }
        if (table === "channels") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: FAKE_CHANNEL, error: null }),
            delete: channelDeleteMock,
          };
        }
        if (table === "waha_sessions") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);

    const wahaError = new Error("WAHA connection refused");
    vi.mocked(wahaFromEnv).mockReturnValue({
      createSession: vi.fn().mockRejectedValue(wahaError),
    } as never);

    const res = await POST(makeRequest({ brandId: "brand-1" }));
    expect(res.status).toBe(502);

    const json = await res.json();
    // H2 sanitization: upstream error message is logged server-side but NOT leaked
    // to the client (WahaError.body may echo the X-Api-Key header).
    expect(json.error).toBe("Upstream WAHA error creating session");
    expect(json.error).not.toContain("WAHA connection refused");

    // channels row DELETED (CASCADE cleans waha_sessions)
    expect(channelDeleteMock).toHaveBeenCalled();
    expect(channelDeleteEqMock).toHaveBeenCalledWith("id", "channel-uuid-1");
  });

  // ── 4. 400 on oversized name ────────────────────────────────────────────
  it("returns 400 when name exceeds 100 chars", async () => {
    const { adminMock } = buildAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);
    const res = await POST(makeRequest({ brandId: "brand-1", name: "x".repeat(101) }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/100/);
  });
});
