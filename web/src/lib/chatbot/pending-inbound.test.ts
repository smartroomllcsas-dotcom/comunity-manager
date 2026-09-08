import { describe, it, expect } from "vitest";
import { payloadHasInboundFrom } from "./pending-inbound";

describe("payloadHasInboundFrom", () => {
  it("waha inbound from the same customer", () => {
    expect(payloadHasInboundFrom("waha", { event: "message", payload: { from: "57300@c.us" } }, "57300")).toBe(true);
    expect(
      payloadHasInboundFrom("waha", { event: "message", payload: { from: "1@lid", _data: { key: { remoteJidAlt: "57300@s.whatsapp.net" } } } }, "57300")
    ).toBe(true);
  });
  it("ignores waha echoes and acks", () => {
    expect(payloadHasInboundFrom("waha", { event: "message.any", payload: { from: "57300@c.us", fromMe: true } }, "57300")).toBe(false);
    expect(payloadHasInboundFrom("waha", { event: "message.ack", payload: { from: "57300@c.us" } }, "57300")).toBe(false);
  });
  it("meta inbound vs echo", () => {
    const inbound = { entry: [{ messaging: [{ sender: { id: "psid1" }, message: { mid: "m1" } }] }] };
    const echo = { entry: [{ messaging: [{ sender: { id: "page" }, recipient: { id: "psid1" }, message: { mid: "m2", is_echo: true } }] }] };
    expect(payloadHasInboundFrom("instagram", inbound, "psid1")).toBe(true);
    expect(payloadHasInboundFrom("instagram", echo, "psid1")).toBe(false);
    expect(payloadHasInboundFrom("instagram", inbound, "other")).toBe(false);
  });
});
