import { describe, it, expect } from "vitest";
import { lastOutboundIsHuman } from "./human-active";

describe("lastOutboundIsHuman", () => {
  it("true when the newest outbound was written by a person", () => {
    expect(lastOutboundIsHuman([
      { direction: "outbound", is_bot: false, content: { text: "Hola, te llamo mañana" } },
      { direction: "outbound", is_bot: true, content: { text: "Bienvenido" } },
    ])).toBe(true);
  });
  it("false when the newest outbound is the bot or an echo of the bot", () => {
    expect(lastOutboundIsHuman([{ direction: "outbound", is_bot: true, content: { text: "Bienvenido" } }])).toBe(false);
    expect(lastOutboundIsHuman([
      { direction: "outbound", is_bot: false, content: { text: "Bienvenido" } },
      { direction: "outbound", is_bot: true, content: { text: "Bienvenido" } },
    ])).toBe(false);
  });
  it("ignores inbound rows", () => {
    expect(lastOutboundIsHuman([{ direction: "inbound", is_bot: false, content: { text: "hola" } }])).toBe(false);
  });
});
