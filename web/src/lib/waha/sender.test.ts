import { describe, it, expect, vi } from "vitest";
import { sendWahaText, wahaExternalId } from "./sender";

function makeAdmin(sessionRow: { session_name: string } | null) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: sessionRow, error: null }),
        }),
      }),
    }),
  } as any;
}

describe("sendWahaText", () => {
  it("maps digits → @c.us and calls sendText", async () => {
    const sendText = vi.fn().mockResolvedValue({ id: "true_573001112233@c.us_XYZ" });
    const out = await sendWahaText({
      admin: makeAdmin({ session_name: "brand_abc" }),
      channelId: "ch1",
      toPhone: "+57 300 111 2233",
      text: "hola",
      client: { sendText } as any,
    });
    expect(sendText).toHaveBeenCalledWith({
      session: "brand_abc",
      chatId: "573001112233@c.us",
      text: "hola",
    });
    expect(out.externalId).toContain("@c.us_");
  });

  it("throws when no waha session for channel", async () => {
    await expect(
      sendWahaText({
        admin: makeAdmin(null),
        channelId: "ch1",
        toPhone: "573001112233",
        text: "hi",
        client: { sendText: vi.fn() } as any,
      })
    ).rejects.toThrow(/no waha session/i);
  });
});

describe("wahaExternalId", () => {
  it("keeps a plain string id", () => {
    expect(wahaExternalId({ id: "true_1@c.us_ABC" }, "1@c.us")).toBe("true_1@c.us_ABC");
  });
  it("uses id._serialized (WEBJS)", () => {
    expect(wahaExternalId({ id: { _serialized: "true_1@c.us_ABC", id: "ABC" } }, "1@c.us")).toBe(
      "true_1@c.us_ABC"
    );
  });
  it("builds true_<chat>_<id> from key.id (NOWEB)", () => {
    expect(wahaExternalId({ key: { id: "ABC", remoteJid: "1@c.us", fromMe: true } }, "1@c.us")).toBe(
      "true_1@c.us_ABC"
    );
  });
  it("returns empty string when unknown", () => {
    expect(wahaExternalId({}, "1@c.us")).toBe("");
  });
});
