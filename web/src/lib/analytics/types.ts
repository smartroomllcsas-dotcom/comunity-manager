// Sprint 25 · Agente K — Tipos compartidos de analytics.
//
// Cada provider (meta/tiktok/linkedin/threads/ga4) implementa este contrato
// para que el cron de snapshotting sea agnóstico al canal.
//
// Todos los fetchers devuelven { ok, ...metrics } | { ok:false, error, retryable }
// — nunca throw — para que el cron pueda continuar con los siguientes posts
// aunque un provider falle.

export interface PostMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  video_views?: number;
  video_completion_rate?: number; // 0..1
  engagement_rate: number;         // 0..1
  raw: unknown;
}

export interface AccountMetrics {
  followers: number;
  followers_delta_30d: number;
  posts_published_30d: number;
  total_engagement_30d: number;
  avg_engagement_rate_30d: number; // 0..1
  raw: unknown;
}

export type FetchResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; retryable: boolean };

export interface FetchOpts {
  /** Milisegundos hasta cancelar la request. Default 30_000. */
  timeoutMs?: number;
  /** Sub-tipo del post (ig-reel, ig-story, fb, etc). Algunos providers ramifican. */
  subKind?: string;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Helper — engagement_rate = (likes+comments+shares+saves) / max(reach,1) */
export function computeEngagementRate(m: {
  likes: number; comments: number; shares: number; saves: number; reach: number; impressions: number;
}): number {
  const engagements = m.likes + m.comments + m.shares + m.saves;
  const base = m.reach > 0 ? m.reach : (m.impressions > 0 ? m.impressions : 1);
  const r = engagements / base;
  // Cap a [0, 1] para no ensuciar el NUMERIC(5,4) con outliers de reach=0.
  return Math.min(1, Math.max(0, r));
}

/** Helper — AbortSignal con timeout compatible con runtimes que no exponen AbortSignal.timeout */
export function timeoutSignal(ms: number): AbortSignal {
  // Node 18+ tiene AbortSignal.timeout; fallback manual por si acaso.
  const anyAS = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
  if (typeof anyAS.timeout === "function") return anyAS.timeout(ms);
  const ac = new AbortController();
  setTimeout(() => ac.abort(new Error(`timeout ${ms}ms`)), ms).unref?.();
  return ac.signal;
}

/** Classifier — decide si un error de fetch amerita reintento del cron. */
export function isRetryableStatus(status: number): boolean {
  if (status >= 500) return true;
  if (status === 429) return true;         // rate limit — reintentar más tarde
  if (status === 408) return true;         // request timeout
  return false;
}
