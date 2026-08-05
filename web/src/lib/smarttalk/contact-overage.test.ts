import { describe, expect, it } from "vitest";
import { buildContactOverageEventKey } from "./contact-overage";

describe("buildContactOverageEventKey", () => {
  it("prefiere el id del mensaje del proveedor", () => {
    const key = buildContactOverageEventKey({
      channelId: "channel-1",
      source: "instagram",
      providerContactId: "ig-user-1",
      providerMessageId: "mid-123",
      payload: { message: "hola" },
    });

    expect(key).toBe("mid-123");
  });

  it("genera una clave estable para eventos sin id del proveedor", () => {
    const input = {
      channelId: "channel-1",
      source: "messenger" as const,
      providerContactId: "psid-1",
      payload: { postback: { payload: "start" } },
    };

    expect(buildContactOverageEventKey(input)).toBe(buildContactOverageEventKey(input));
  });

  it("permite una clave explícita y la limita a 200 caracteres", () => {
    const key = buildContactOverageEventKey({
      channelId: "channel-1",
      source: "whatsapp",
      providerContactId: "wa-1",
      eventKey: "x".repeat(300),
      payload: { id: "message-1" },
    });

    expect(key).toHaveLength(200);
  });
});
