import { describe, it, expect } from "vitest";
import { looksLikeOptOut, isDoNotContact } from "./do-not-contact";

describe("looksLikeOptOut", () => {
  it.each([
    "No quiero que me contacten",
    "no me escriban más por favor",
    "No me interesa",
    "dejen de escribir",
    "No molestar",
    "STOP",
    "quiero darme de baja",
    "no quiero ser contactado",
  ])("detects %s", (t) => expect(looksLikeOptOut(t)).toBe(true));
  it.each(["Hola, quiero el catálogo", "no tengo el dinero hoy pero mañana sí", "¿me pueden llamar?", "no"])(
    "does not flag %s",
    (t) => expect(looksLikeOptOut(t)).toBe(false)
  );
});

describe("looksLikeOptOut first reply", () => {
  it("a bare 'No' counts only as the first reply", () => {
    expect(looksLikeOptOut("No", { firstReply: true })).toBe(true);
    expect(looksLikeOptOut("no gracias", { firstReply: true })).toBe(true);
    expect(looksLikeOptOut("No", { firstReply: false })).toBe(false);
    expect(looksLikeOptOut("no tengo presupuesto aún", { firstReply: true })).toBe(false);
  });
});

describe("isDoNotContact", () => {
  it("flag or stop stage", () => {
    expect(isDoNotContact({ custom_fields: { do_not_contact: true } })).toBe(true);
    expect(isDoNotContact({ lifecycle_stage_id: "s1" }, new Set(["s1"]))).toBe(true);
    expect(isDoNotContact({ lifecycle_stage_id: "s2", custom_fields: {} }, new Set(["s1"]))).toBe(false);
  });
});
