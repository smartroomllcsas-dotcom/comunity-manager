import { describe, it, expect } from "vitest";
import { sessionNameForBrand, isValidWahaSessionName } from "./session-name";

describe("sessionNameForBrand", () => {
  it("returns brand_<uuid-without-dashes> for a valid UUID", () => {
    expect(sessionNameForBrand("11111111-2222-3333-4444-555555555555")).toBe(
      "brand_11111111222233334444555555555555"
    );
  });

  it("throws matching /brand id/ for empty string", () => {
    expect(() => sessionNameForBrand("")).toThrow(/brand id/);
  });

  it("throws matching /uuid/i for non-UUID string", () => {
    expect(() => sessionNameForBrand("not-a-uuid")).toThrow(/uuid/i);
  });
});

describe("isValidWahaSessionName", () => {
  it("returns true for a valid session name", () => {
    expect(isValidWahaSessionName("brand_11111111222233334444555555555555")).toBe(true);
  });

  it("returns false for invalid session names", () => {
    expect(isValidWahaSessionName("brand_x!")).toBe(false);
    expect(isValidWahaSessionName("")).toBe(false);
    expect(isValidWahaSessionName("a".repeat(65))).toBe(false);
  });
});
