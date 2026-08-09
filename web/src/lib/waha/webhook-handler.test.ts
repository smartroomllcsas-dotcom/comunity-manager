import { describe, it, expect, vi, beforeEach } from "vitest";
import { processWahaWebhookEvent } from "./webhook-handler";
import type { WahaMessageEvent } from "./types";

// ─── Billing mock ───────────────────────────────────────────────────────────
vi.mock("@/lib/billing/service", () => ({
  checkBillingFeature: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("@/lib/billing/features", () => ({
  BILLING_FEATURES: { CONTACTS_TOTAL: "contacts_total" },
}));

// ─── Supabase admin builder ───────────────────────────────────────────────
function makeSelectableAdmin(opts: {
  sessionRow?: { channel_id: string } | null;
  channelRow?: Record<string, unknown> | null;
  contactRow?: { id: string } | null;
  conversationRow?: { id: string; unread_count: number } | null;
} = {}) {
  const {
    sessionRow = { channel_id: "ch1" },
    channelRow = { id: "ch1", organization_id: "org1", brand_id: "brand1" },
    contactRow = null,
    conversationRow = null,
  } = opts;

  const inserts: Array<{ table: string; data: unknown }> = [];
  const updates: Array<{ table: string; data: unknown }> = [];

  const admin = {
    from(table: string) {
      return {
        update(data: unknown) {
          updates.push({ table, data });
          // waha_sessions update returns the session row (with channel_id)
          const row = table === "waha_sessions" ? sessionRow : null;
          const chain: Record<string, unknown> = {};
          chain.eq = (..._: unknown[]) => chain;
          chain.select = (..._: unknown[]) => chain;
          chain.maybeSingle = () => Promise.resolve({ data: row, error: null });
          chain.single = () => Promise.resolve({ data: row, error: null });
          chain.then = undefined;
          return chain;
        },
        insert(data: unknown) {
          inserts.push({ table, data });
          let row: unknown = null;
          if (table === "contacts") row = { id: "new-contact-id" };
          if (table === "conversations") row = { id: "new-convo-id" };
          if (table === "messages") row = { id: "new-msg-id" };
          // Build chainable with select → single/maybeSingle
          const chain: Record<string, unknown> = {};
          const resolvedRow = row;
          chain.select = (..._: unknown[]) => chain;
          chain.single = () => Promise.resolve({ data: resolvedRow, error: null });
          chain.maybeSingle = () => Promise.resolve({ data: resolvedRow, error: null });
          chain.eq = (..._: unknown[]) => chain;
          chain.then = undefined;
          return chain;
        },
        select(..._args: unknown[]) {
          // Build a chainable that collects .eq() calls and resolves at maybeSingle/single
          const eqChain: Record<string, unknown> = {};
          eqChain.eq = (..._: unknown[]) => eqChain;
          eqChain.maybeSingle = () => {
            if (table === "waha_sessions") return Promise.resolve({ data: sessionRow, error: null });
            if (table === "channels") return Promise.resolve({ data: channelRow, error: null });
            if (table === "contacts") return Promise.resolve({ data: contactRow, error: null });
            if (table === "conversations") return Promise.resolve({ data: conversationRow, error: null });
            return Promise.resolve({ data: null, error: null });
          };
          eqChain.single = () => Promise.resolve({ data: null, error: null });
          eqChain.then = undefined;
          return eqChain;
        },
      };
    },
  };

  return {
    admin: admin as unknown as Parameters<typeof processWahaWebhookEvent>[0]["admin"],
    inserts,
    updates,
  };
}

function makePayload(
  event: WahaMessageEvent["event"],
  session: string,
  payload: Record<string, unknown>
): WahaMessageEvent {
  return { id: "evt-1", timestamp: Date.now(), event, session, payload };
}

// ─── Existing session.status tests ───────────────────────────────────────────
describe("processWahaWebhookEvent — session.status", () => {
  it("WORKING → updates session + channel with status=active + connected_at", async () => {
    const { admin, updates } = makeSelectableAdmin({ sessionRow: { channel_id: "ch1" } });
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

  it("FAILED → channel.status=disconnected, no connected_at", async () => {
    const { admin, updates } = makeSelectableAdmin({ sessionRow: { channel_id: "ch2" } });
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

  it("STARTING → channel.status=pending", async () => {
    const { admin, updates } = makeSelectableAdmin({ sessionRow: { channel_id: "ch3" } });
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
    const { admin } = makeSelectableAdmin();
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
    const { admin } = makeSelectableAdmin({ sessionRow: null });
    const result = await processWahaWebhookEvent({
      id: "row-5",
      payload: makePayload("session.status", "ghost-session", { status: "WORKING" }),
      admin,
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("ghost-session") });
  });
});

// ─── New: inbound message tests ───────────────────────────────────────────────
describe("processWahaWebhookEvent — message (inbound)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inbound text from new contact → inserts contact, conversation, message; updates preview+unread=1", async () => {
    const { admin, inserts, updates } = makeSelectableAdmin({
      contactRow: null,       // new contact
      conversationRow: null,  // new conversation
    });

    const { checkBillingFeature } = await import("@/lib/billing/service");

    const result = await processWahaWebhookEvent({
      id: "row-msg-1",
      payload: makePayload("message", "brand_abc", {
        id: "msg-wa-id-1",
        from: "573001112233@c.us",
        to: "573009998877@c.us",
        fromMe: false,
        body: "hola mundo",
        type: "chat",
        timestamp: 1700000000,
        notifyName: "Leo",
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    expect(checkBillingFeature).toHaveBeenCalledWith(expect.objectContaining({
      featureCode: "contacts_total",
    }));

    const contactInsert = inserts.find((i) => i.table === "contacts");
    expect(contactInsert).toBeDefined();
    expect((contactInsert!.data as Record<string, unknown>).wa_id).toBe("573001112233");
    expect((contactInsert!.data as Record<string, unknown>).name).toBe("Leo");

    const convoInsert = inserts.find((i) => i.table === "conversations");
    expect(convoInsert).toBeDefined();
    expect((convoInsert!.data as Record<string, unknown>).status).toBe("open");

    const msgInsert = inserts.find((i) => i.table === "messages");
    expect(msgInsert).toBeDefined();
    expect((msgInsert!.data as Record<string, unknown>).direction).toBe("inbound");
    expect((msgInsert!.data as Record<string, unknown>).type).toBe("text");
    expect((msgInsert!.data as Record<string, unknown>).wa_message_id).toBe("msg-wa-id-1");

    const convoUpdate = updates.find((u) => u.table === "conversations");
    expect(convoUpdate).toBeDefined();
    expect((convoUpdate!.data as Record<string, unknown>).last_message_preview).toBe("hola mundo");
    expect((convoUpdate!.data as Record<string, unknown>).unread_count).toBe(1);
  });

  it("inbound text from existing contact → no contact insert; updates last_message_at; unread = existing+1", async () => {
    const { admin, inserts, updates } = makeSelectableAdmin({
      contactRow: { id: "existing-contact-id" },
      conversationRow: { id: "existing-convo-id", unread_count: 3 },
    });

    const result = await processWahaWebhookEvent({
      id: "row-msg-2",
      payload: makePayload("message", "brand_abc", {
        id: "msg-wa-id-2",
        from: "573001112233@c.us",
        fromMe: false,
        body: "segundo mensaje",
        type: "chat",
        timestamp: 1700000001,
        notifyName: "Leo",
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });

    const contactInsert = inserts.find((i) => i.table === "contacts");
    expect(contactInsert).toBeUndefined(); // no new contact

    const contactUpdate = updates.find((u) => u.table === "contacts");
    expect(contactUpdate).toBeDefined();
    expect((contactUpdate!.data as Record<string, unknown>).last_message_at).toBeDefined();

    const convoUpdate = updates.find((u) => u.table === "conversations");
    expect((convoUpdate!.data as Record<string, unknown>).unread_count).toBe(4); // 3 + 1
  });

  it("fromMe=true → no DB writes, returns ok:true", async () => {
    const { admin, inserts, updates } = makeSelectableAdmin();

    const result = await processWahaWebhookEvent({
      id: "row-msg-3",
      payload: makePayload("message", "brand_abc", {
        id: "msg-echo",
        from: "573001112233@c.us",
        fromMe: true,
        body: "outbound echo",
        type: "chat",
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    // Only waha_sessions update is allowed (from session lookup in session.status path)
    // For non-session.status events, no waha_sessions update happens either
    const nonSessionInserts = inserts.filter((i) => i.table !== "waha_sessions");
    const nonSessionUpdates = updates.filter((u) => u.table !== "waha_sessions" && u.table !== "channels");
    expect(nonSessionInserts).toHaveLength(0);
    expect(nonSessionUpdates).toHaveLength(0);
  });

  it("group @g.us → no DB writes, returns ok:true", async () => {
    const { admin, inserts, updates } = makeSelectableAdmin();

    const result = await processWahaWebhookEvent({
      id: "row-msg-4",
      payload: makePayload("message", "brand_abc", {
        id: "msg-group",
        from: "120363000000000001@g.us",
        fromMe: false,
        body: "group message",
        type: "chat",
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    const nonSessionInserts = inserts.filter((i) => i.table !== "waha_sessions");
    const nonSessionUpdates = updates.filter((u) => u.table !== "waha_sessions" && u.table !== "channels");
    expect(nonSessionInserts).toHaveLength(0);
    expect(nonSessionUpdates).toHaveLength(0);
  });

  it("channel has no brand_id → returns { ok: false }", async () => {
    const { admin } = makeSelectableAdmin({
      channelRow: { id: "ch1", organization_id: "org1", brand_id: null },
    });

    const result = await processWahaWebhookEvent({
      id: "row-msg-5",
      payload: makePayload("message", "brand_abc", {
        id: "msg-no-brand",
        from: "573001112233@c.us",
        fromMe: false,
        body: "test",
        type: "chat",
      }),
      admin,
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("brand_id") });
  });
});

// ─── New: message.any tests ───────────────────────────────────────────────────
describe("processWahaWebhookEvent — message.any", () => {
  it("message.any inbound → same ingestion as message", async () => {
    const { admin, inserts } = makeSelectableAdmin({
      contactRow: null,
      conversationRow: null,
    });

    const result = await processWahaWebhookEvent({
      id: "row-any-1",
      payload: makePayload("message.any", "brand_abc", {
        id: "msg-any-id",
        from: "573001112233@c.us",
        fromMe: false,
        body: "mensaje any",
        type: "chat",
        timestamp: 1700000002,
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    expect(inserts.find((i) => i.table === "messages")).toBeDefined();
  });
});

// ─── New: message.ack tests ───────────────────────────────────────────────────
describe("processWahaWebhookEvent — message.ack", () => {
  it("ack=3 (READ) → messages.update with status=read via wa_message_id", async () => {
    const { admin, updates } = makeSelectableAdmin();

    const result = await processWahaWebhookEvent({
      id: "row-ack-1",
      payload: makePayload("message.ack", "brand_abc", {
        id: "true_573001112233@c.us_XYZ",
        ack: 3,
        ackName: "READ",
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    const msgUpdate = updates.find((u) => u.table === "messages");
    expect(msgUpdate).toBeDefined();
    expect((msgUpdate!.data as Record<string, unknown>).status).toBe("read");
  });

  it("ack=0 (error) → messages.update with status=failed", async () => {
    const { admin, updates } = makeSelectableAdmin();

    const result = await processWahaWebhookEvent({
      id: "row-ack-2",
      payload: makePayload("message.ack", "brand_abc", {
        id: "true_573001112233@c.us_ABC",
        ack: 0,
        ackName: "ERROR",
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    const msgUpdate = updates.find((u) => u.table === "messages");
    expect(msgUpdate).toBeDefined();
    expect((msgUpdate!.data as Record<string, unknown>).status).toBe("failed");
  });

  it("ack=4 (played) → status=read", async () => {
    const { admin, updates } = makeSelectableAdmin();

    const result = await processWahaWebhookEvent({
      id: "row-ack-3",
      payload: makePayload("message.ack", "brand_abc", {
        id: "true_573001112233@c.us_DEF",
        ack: 4,
      }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    const msgUpdate = updates.find((u) => u.table === "messages");
    expect((msgUpdate!.data as Record<string, unknown>).status).toBe("read");
  });

  it("missing id in ack payload → ok:true, no messages update", async () => {
    const { admin, updates } = makeSelectableAdmin();

    const result = await processWahaWebhookEvent({
      id: "row-ack-4",
      payload: makePayload("message.ack", "brand_abc", { ack: 3 }),
      admin,
    });

    expect(result).toEqual({ ok: true });
    const msgUpdate = updates.find((u) => u.table === "messages");
    expect(msgUpdate).toBeUndefined();
  });
});
