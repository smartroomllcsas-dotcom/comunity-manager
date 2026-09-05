import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/waha/client", () => ({
  wahaFromEnv: vi.fn(),
  WahaError: class WahaError extends Error {
    constructor(public status: number, msg: string) {
      super(msg);
    }
  },
}));

const { createAdminClient } = await import("@/lib/supabase/admin");
const { wahaFromEnv } = await import("@/lib/waha/client");
const { GET } = await import("./route");

function makeAdmin(rows: Array<{ id: string; session_name: string; channel_id: string }>) {
  const updates: Array<{ table: string; v: unknown }> = [];
  return {
    updates,
    admin: {
      from(table: string) {
        return {
          select: () => ({
            lt: () => ({
              limit: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
          update(v: unknown) {
            updates.push({ table, v });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as any,
  };
}

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/cron/waha-watchdog", { headers }) as any;

describe("waha-watchdog cron", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "test-secret");
  });

  it("returns 401 when Authorization header is missing or wrong", async () => {
    const res = await GET(req({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("marks channel disconnected when session status is STOPPED", async () => {
    const { updates, admin } = makeAdmin([
      { id: "row-1", session_name: "sess-abc", channel_id: "ch-1" },
    ]);

    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(wahaFromEnv).mockReturnValue({
      getSession: vi.fn().mockResolvedValue({ status: "STOPPED" }),
    } as any);

    const res = await GET(req({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checked).toBe(1);
    expect(body.updated).toBe(1);

    const channelUpdate = updates.find((u) => u.table === "channels");
    expect(channelUpdate?.v).toMatchObject({ status: "disconnected" });
  });
});
