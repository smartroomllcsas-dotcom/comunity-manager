// Sprint 25 · Client approval workflow — HMAC token issuance & verification.
//
// Format: base64url(payload) where payload = `${postId}|${clientId}|${expiresAt}|${hmac}`.
// HMAC key: process.env.APPROVAL_HMAC_SECRET (>= 32 bytes hex/base64).
//   Falls back to CRON_SECRET if APPROVAL_HMAC_SECRET is unset.
//
// SECURITY: never persist the plain token. Callers hash with SHA-256 before
// writing to `cm_post_approvals.token_hash` and re-hash on lookup.

import { createHmac, timingSafeEqual, createHash } from "node:crypto";

const DELIM = "|";

function getSecret(): string {
  const primary = process.env.APPROVAL_HMAC_SECRET?.trim();
  if (primary && primary.length >= 32) return primary;
  const fallback = process.env.CRON_SECRET?.trim();
  if (fallback && fallback.length >= 32) return fallback;
  // Fail loudly in prod, but allow dev with warning.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APPROVAL_HMAC_SECRET (or CRON_SECRET) must be set and >= 32 bytes",
    );
  }
  // Dev-only stub. Tokens issued with this will not survive across restarts
  // that change the env, which is desired behaviour.
  return "dev-only-approval-secret-please-set-env-var-1234567890";
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/**
 * Issue a signed magic-link token good for `ttlHours` (default 7 days).
 * Returned string is URL-safe and opaque to the client.
 */
export function issueApprovalToken(
  postId: string,
  clientId: string,
  ttlHours = 168,
): string {
  if (!postId || !clientId) throw new Error("postId and clientId required");
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
  const body = `${postId}${DELIM}${clientId}${DELIM}${expiresAt}`;
  const mac = sign(body);
  return b64urlEncode(`${body}${DELIM}${mac}`);
}

export interface DecodedApprovalToken {
  postId: string;
  clientId: string;
  expiresAt: number;
  /** false if expired, malformed, or HMAC mismatch. */
  valid: boolean;
  reason?: "malformed" | "bad_signature" | "expired";
}

export function verifyApprovalToken(token: string): DecodedApprovalToken {
  const bad = (
    reason: DecodedApprovalToken["reason"],
  ): DecodedApprovalToken => ({
    postId: "",
    clientId: "",
    expiresAt: 0,
    valid: false,
    reason,
  });

  if (!token || typeof token !== "string") return bad("malformed");

  let raw: string;
  try {
    raw = b64urlDecode(token);
  } catch {
    return bad("malformed");
  }

  const parts = raw.split(DELIM);
  if (parts.length !== 4) return bad("malformed");
  const [postId, clientId, expStr, providedMac] = parts;
  const expiresAt = Number(expStr);
  if (!postId || !clientId || !Number.isFinite(expiresAt)) return bad("malformed");

  const expectedMac = sign(`${postId}${DELIM}${clientId}${DELIM}${expiresAt}`);
  const a = Buffer.from(expectedMac, "hex");
  const b = Buffer.from(providedMac, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return bad("bad_signature");

  if (Date.now() > expiresAt) {
    return { postId, clientId, expiresAt, valid: false, reason: "expired" };
  }

  return { postId, clientId, expiresAt, valid: true };
}

/** SHA-256 hex of the plain token; safe to store in DB for lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
