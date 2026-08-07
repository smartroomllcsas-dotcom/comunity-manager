import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyWahaSignature } from "./signature";

const SECRET = "test-secret";
const BODY = '{"event":"message","session":"brand_test"}';

function makeValidSig(body: string, secret: string): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("verifyWahaSignature", () => {
  it("accepts a valid SHA-512 HMAC hex signature", () => {
    const sig = makeValidSig(BODY, SECRET);
    expect(verifyWahaSignature(BODY, SECRET, sig)).toBe(true);
  });

  it('rejects a wrong signature ("0".repeat(128))', () => {
    const sig = "0".repeat(128);
    expect(verifyWahaSignature(BODY, SECRET, sig)).toBe(false);
  });

  it("rejects null signature", () => {
    expect(verifyWahaSignature(BODY, SECRET, null)).toBe(false);
  });

  it("rejects empty signature", () => {
    expect(verifyWahaSignature(BODY, SECRET, "")).toBe(false);
  });

  it("rejects when body is tampered", () => {
    const sig = makeValidSig(BODY, SECRET);
    expect(verifyWahaSignature(BODY + "tampered", SECRET, sig)).toBe(false);
  });

  it("rejects when lengths differ (short signature like 'abcd')", () => {
    expect(verifyWahaSignature(BODY, SECRET, "abcd")).toBe(false);
  });
});
