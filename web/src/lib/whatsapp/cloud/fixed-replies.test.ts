import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { matchFixedReply } from "./fixed-replies";

const RULES = [
  {
    match: "cat[aá]logo|informaci[oó]n|precios?|mayorista",
    reply: "Escribe QUIERO SER MAYORISTA y te enviamos los datos para realizar tu activación. 💕",
    unless: "quiero ser mayorista",
  },
];

describe("matchFixedReply", () => {
  it("returns the exact reply when the message matches", () => {
    expect(matchFixedReply(RULES, "Hola, quiero el catálogo")).toBe(RULES[0].reply);
  });
  it("does not reply when nothing matches", () => {
    expect(matchFixedReply(RULES, "Hola, buenas tardes")).toBeNull();
  });
  it("skips the rule when the current message is the trigger phrase itself", () => {
    expect(matchFixedReply(RULES, "QUIERO SER MAYORISTA")).toBeNull();
    expect(matchFixedReply(RULES, "Escribe QUIERO SER MAYORISTA")).toBeNull();
  });
  it("skips the rule when the customer already wrote the trigger phrase before", () => {
    expect(matchFixedReply(RULES, "y el catálogo?", ["QUIERO SER MAYORISTA", "Cartagena"])).toBeNull();
  });
  it("with once, does not repeat a reply already sent in the conversation", () => {
    const rules = [{ ...RULES[0], once: true }];
    expect(matchFixedReply(rules, "el catálogo?", [], [RULES[0].reply])).toBeNull();
    expect(matchFixedReply(rules, "el catálogo?", [], ["otro texto"])).toBe(RULES[0].reply);
  });
  it("ignores invalid regexes", () => {
    expect(matchFixedReply([{ match: "(", reply: "x" }], "hola (")).toBeNull();
  });
});
