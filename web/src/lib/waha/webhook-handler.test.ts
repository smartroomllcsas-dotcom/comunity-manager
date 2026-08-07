import { describe, it, expect, vi } from "vitest";
import { processWahaWebhookEvent } from "./webhook-handler";
import type { WahaMessageEvent } from "./types";

// Builder-style mock for the Supabase admin client.
// Captures every .update() call by table name so we can assert on them.
function makeAdmin(sessionRow: { channel_id: string } | null = { channel_id: "ch1" }) {
  const updates: Array<{ table: string; data: unknown }> = [];

  const admin = {
    from(table: string) {
      return {
        update(data: unknown) {
          updates.push({ table, data });
          // Build a chainable object whose terminal is .maybeSingle() for
          // waha_sessions or a thenable for channels (no .select() call).
          const chain: {
            eq: (...args: unknown[]) => typeof chain;
            select: (...args: unknown[]) => typeof chain;
            maybeSingle: () => Promise<{ data: unknown; error: null }>;
            then: undefined; // not a thenable itself — only maybeSingle is
          } = {
            eq(..._args: unknown[]) { return chain; },
            select(..._args: unknown[]) { return chain; },
            maybeSingle() {
              const row = table === "waha_sessions" ? sessionRow : null;
              return Promise.resolve({ data: row, error: null });
            },
            then: undefined,
          };
          return chain;
        },
      };
    },
  };

  return { admin: admin as unknown as Parameters<typeof processWahaWebhookEvent>[0]["admin"], updates };
}

function makePayload(
  event: WahaMessageEvent["event"],
  session: string,
  payload: Record<string, unknown>
): WahaMessageEvent {
  return { id: "evt-1", timestamp: Date.now(), event, session, payload };
}

describe("processWahaWebhookEvent", () => {
  it("session.status WORKING → updates session + channel with status=active + connected_at", async () => {
    const { admin, updates } = makeAdmin({ channel_id: "ch1" });
    const result = await processWahaWebhookEvent({
      id: "row-1",
      payload: makePayload("session.status", "my-session", {
        status: "WORKING",
        me: { id: "5491111111111@c.us", pushname: "Test User" },
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });

    const sessionUpd = updates.find((u) => u.table === "waha_sessions");
    expect(sessionUpd).toBeDefined();
    expect((sessionUpd!.data as Record<string, unknown>).status).toBe("WORKING");
    expect((sessionUpd!.data as Record<string, unknown>).phone_number).toBe("5491111111111");
    expect((sessionUpd!.data as Record<string, unknown>).push_name).toBe("Test User");

    const channelUpd = updates.find((u) => u.table === "channels");
    expect(channelUpd).toBeDefined();
    expect((channelUpd!.data as Record<string, unknown>).status).toBe("active");
    expect((channelUpd!.data as Record<string, unknown>).connected_at).toBeDefined();
  });

  it("session.status FAILED → channel.status=disconnected, no connected_at", async () => {
    const { admin, updates } = makeAdmin({ channel_id: "ch2" });
    const result = await processWahaWebhookEvent({
      id: "row-2",
      payload: makePayload("session.status", "my-session", { status: "FAILED" }),
      admin,
    });

    expect(result).toEqual({ ok: true });

    const channelUpd = updates.find((u) => u.table === "channels");
    expect((channelUpd!.data as Record<string, unknown>).status).toBe("disconnected");
    expect((channelUpd!.data as Record<string, unknown>).connected_at).toBeUndefined();
  });

  it("session.status STARTING → channel.status=pending", async () => {
    const { admin, updates } = makeAdmin({ channel_id: "ch3" });
    const result = await processWahaWebhookEvent({
      id: "row-3",
      payload: makePayload("session.status", "my-session", { status: "STARTING" }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    const channelUpd = updates.find((u) => u.table === "channels");
    expect((channelUpd!.data as Record<string, unknown>).status).toBe("pending");
  });

  it("missing session name → { ok: false }", async () => {
    const { admin } = makeAdmin();
    const payload: WahaMessageEvent = {
      id: "evt-x",
      timestamp: Date.now(),
      event: "session.status",
      session: "",
      payload: { status: "WORKING" },
    };
    const result = await processWahaWebhookEvent({ id: "row-4", payload, admin });
    expect(result).toMatchObject({ ok: false });
  });

  it("no matching session in DB → { ok: false }", async () => {
    const { admin } = makeAdmin(null); // DB returns null
    const result = await processWahaWebhookEvent({
      id: "row-5",
      payload: makePayload("session.status", "ghost-session", { status: "WORKING" }),
      admin,
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("ghost-session") });
  });

  it("non-session.status event (message) → { ok: true } (no-op)", async () => {
    const { admin, updates } = makeAdmin();
    const result = await processWahaWebhookEvent({
      id: "row-6",
      payload: makePayload("message", "my-session", { body: "hello" }),
      admin,
    });
    expect(result).toEqual({ ok: true });
    // No DB updates should have been made
    expect(updates).toHaveLength(0);
  });
});
