import { createHmac, timingSafeEqual } from "crypto";

export function verifyWahaSignature(
  rawBody: string,
  secret: string,
  signature: string | null | undefined
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");

  if (expected.length !== signature.length) return false;

  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const signatureBuf = Buffer.from(signature, "utf8");
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}
