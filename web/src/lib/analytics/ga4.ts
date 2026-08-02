// Sprint 25 · Agente K — Google Analytics 4 provider.
//
// GA4 mide TRÁFICO WEB atribuible a canales sociales (source/medium). No es
// analytics de posts sociales — es el complemento: "cuánto tráfico enviaron
// mis posts al sitio del cliente".
//
// API: Google Analytics Data API (v1) — https://analyticsdata.googleapis.com
// Auth: Service Account JWT → Bearer token. Firmamos JWT en Node (crypto).
//
// Env vars requeridas (opcional — si faltan, GA4 se desactiva silenciosamente):
//   GOOGLE_ANALYTICS_PROPERTY_ID   (ej. 123456789)
//   GOOGLE_ANALYTICS_CLIENT_EMAIL  (service account email)
//   GOOGLE_ANALYTICS_PRIVATE_KEY   (PEM con \n literales)
//
// Sólo el account-level tiene sentido para GA4 (no hay "post metrics" per se).
// fetchPostMetrics devuelve `{ ok:false, retryable:false }` intencionalmente
// para que el cron lo skip.

import crypto from "node:crypto";

import {
  AccountMetrics,
  DEFAULT_TIMEOUT_MS,
  FetchOpts,
  FetchResult,
  PostMetrics,
  isRetryableStatus,
  timeoutSignal,
} from "./types";

const GA_DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GA_TOKEN_URL = "https://oauth2.googleapis.com/token";

// -----------------------------------------------------------------------------
// Post metrics — no aplica en GA4 (por diseño)
// -----------------------------------------------------------------------------

export async function fetchPostMetrics(
  _accessToken: string,
  _platformPostId: string,
  _opts: FetchOpts = {},
): Promise<FetchResult<PostMetrics>> {
  return {
    ok: false,
    error: "ga4.fetchPostMetrics: no aplica (GA4 no expone métricas por post)",
    retryable: false,
  };
}

// -----------------------------------------------------------------------------
// Account metrics — tráfico social hacia el sitio del cliente
//
// Usamos `accessToken` como marcador; realmente ignoramos ese arg y usamos el
// service account JWT si está configurado. `accountId` = GA4 property_id
// (o dejamos que caiga a env var).
// -----------------------------------------------------------------------------

export async function fetchAccountMetrics(
  _accessToken: string,
  accountId: string,
  opts: FetchOpts = {},
): Promise<FetchResult<AccountMetrics>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const propertyId = accountId || process.env.GOOGLE_ANALYTICS_PROPERTY_ID || "";
  const clientEmail = process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL || "";
  const privateKey = (process.env.GOOGLE_ANALYTICS_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!propertyId || !clientEmail || !privateKey) {
    return {
      ok: false,
      error: "ga4: GOOGLE_ANALYTICS_* env vars missing",
      retryable: false,
    };
  }

  try {
    const bearer = await getGaAccessToken(clientEmail, privateKey, timeoutMs);
    if (!bearer.ok) return bearer;

    const url = `${GA_DATA_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`;
    const res = await fetch(url, {
      method: "POST",
      signal: timeoutSignal(timeoutMs),
      headers: {
        Authorization: `Bearer ${bearer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionSourceMedium" }],
        metrics: [
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "totalUsers" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "sessionMedium",
            stringFilter: { matchType: "CONTAINS", value: "social" },
          },
        },
        limit: 25,
      }),
    });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractGaError(json) || `GA4 runReport ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    const j = json as {
      rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
    };
    const totals = (j.rows ?? []).reduce<{ sessions: number; engaged: number; users: number }>(
      (acc, r) => ({
        sessions: acc.sessions + Number(r.metricValues?.[0]?.value ?? 0),
        engaged:  acc.engaged  + Number(r.metricValues?.[1]?.value ?? 0),
        users:    acc.users    + Number(r.metricValues?.[2]?.value ?? 0),
      }),
      { sessions: 0, engaged: 0, users: 0 },
    );

    // Reusamos el shape AccountMetrics — followers = totalUsers (proxy),
    // total_engagement_30d = engagedSessions, engagement_rate = engaged/sessions.
    return {
      ok: true,
      followers: totals.users,
      followers_delta_30d: 0,
      posts_published_30d: 0,
      total_engagement_30d: totals.engaged,
      avg_engagement_rate_30d: totals.sessions > 0
        ? Math.min(1, Math.max(0, totals.engaged / totals.sessions))
        : 0,
      raw: json,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `ga4.fetchAccountMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

// -----------------------------------------------------------------------------
// Service Account JWT → OAuth2 access token
// -----------------------------------------------------------------------------

async function getGaAccessToken(
  clientEmail: string,
  privateKeyPem: string,
  timeoutMs: number,
): Promise<{ ok: true; token: string } | { ok: false; error: string; retryable: boolean }> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: GA_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const b64url = (buf: Buffer | string): string =>
    (typeof buf === "string" ? Buffer.from(buf) : buf)
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  let signature: string;
  try {
    const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKeyPem);
    signature = b64url(sig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `ga4 JWT sign failed: ${msg}`, retryable: false };
  }

  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(GA_TOKEN_URL, {
    method: "POST",
    signal: timeoutSignal(timeoutMs),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: `ga4 token exchange ${res.status}: ${JSON.stringify(json)}`,
      retryable: isRetryableStatus(res.status),
    };
  }
  const token = (json as { access_token?: string })?.access_token;
  if (!token) return { ok: false, error: "ga4: no access_token in response", retryable: false };
  return { ok: true, token };
}

function extractGaError(raw: unknown): string | null {
  const j = raw as { error?: { message?: string; status?: string } };
  if (j?.error?.message) return `GA4[${j.error.status ?? "?"}]: ${j.error.message}`;
  return null;
}
