// Sprint 26 · Agente S · Onboarding self-service — HMAC token issuance & verification.
//
// Mismo patron que src/lib/approval/tokens.ts (Sprint 25).
// Format: base64url(payload) where payload = `${clientId}|${expiresAt}|${hmac}`.
// HMAC key: process.env.ONBOARDING_HMAC_SECRET (>= 32 bytes hex/base64).
//   Falls back to CRON_SECRET if ONBOARDING_HMAC_SECRET is unset.
//
// SECURITY: never persist the plain token. Callers hash with SHA-256 before
// writing to `cm_onboarding_state.invite_token_hash` and re-hash on lookup.

import { createHmac, timingSafeEqual, createHash } from "node:crypto";

const DELIM = "|";
const DEFAULT_TTL_HOURS = 24 * 30; // 30 dias

function getSecret(): string {
  const primary = process.env.ONBOARDING_HMAC_SECRET?.trim();
  if (primary && primary.length >= 32) return primary;
  const fallback = process.env.CRON_SECRET?.trim();
  if (fallback && fallback.length >= 32) return fallback;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ONBOARDING_HMAC_SECRET (or CRON_SECRET) must be set and >= 32 bytes",
    );
  }
  return "dev-only-onboarding-secret-please-set-env-var-1234567890";
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
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/**
 * Issue a signed magic-link token good for `ttlHours` (default 30 days).
 */
export function issueOnboardingToken(
  clientId: string,
  ttlHours: number = DEFAULT_TTL_HOURS,
): { token: string; expiresAt: number } {
  if (!clientId) throw new Error("clientId required");
  const ttl = ttlHours > 0 && ttlHours <= 24 * 90 ? ttlHours : DEFAULT_TTL_HOURS;
  const expiresAt = Date.now() + ttl * 60 * 60 * 1000;
  const body = `${clientId}${DELIM}${expiresAt}`;
  const mac = sign(body);
  const token = b64urlEncode(`${body}${DELIM}${mac}`);
  return { token, expiresAt };
}

export interface DecodedOnboardingToken {
  clientId: string;
  expiresAt: number;
  valid: boolean;
  reason?: "malformed" | "bad_signature" | "expired";
}

export function verifyOnboardingToken(token: string): DecodedOnboardingToken {
  const bad = (
    reason: DecodedOnboardingToken["reason"],
  ): DecodedOnboardingToken => ({
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
  if (parts.length !== 3) return bad("malformed");
  const [clientId, expiresAtStr, mac] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!clientId || !Number.isFinite(expiresAt)) return bad("malformed");

  const expected = sign(`${clientId}${DELIM}${expiresAtStr}`);
  let ok = false;
  try {
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length === b.length) ok = timingSafeEqual(a, b);
  } catch {
    ok = false;
  }
  if (!ok) return bad("bad_signature");
  if (Date.now() > expiresAt) {
    return { clientId, expiresAt, valid: false, reason: "expired" };
  }
  return { clientId, expiresAt, valid: true };
}

/** SHA-256 hex for persisting the token hash instead of the raw token. */
export function hashOnboardingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
