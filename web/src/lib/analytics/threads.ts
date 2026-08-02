// Sprint 25 · Agente K — Threads analytics provider.
//
// Threads API (Meta, v1.0):
//   Post insights:
//     GET https://graph.threads.net/v1.0/{thread-id}/insights
//         ?metric=views,likes,replies,reposts,quotes
//   Account insights:
//     GET https://graph.threads.net/v1.0/{user-id}/threads_insights
//         ?metric=views,likes,replies,reposts,quotes,followers_count&period=day
//     GET https://graph.threads.net/v1.0/{user-id}?fields=followers_count
//
// Threads NO expone impressions/reach separados; usamos `views` como impressions
// y dejamos reach en 0. También no expone saves ni clicks.

import {
  AccountMetrics,
  DEFAULT_TIMEOUT_MS,
  FetchOpts,
  FetchResult,
  PostMetrics,
  computeEngagementRate,
  isRetryableStatus,
  timeoutSignal,
} from "./types";

const TH_BASE = "https://graph.threads.net/v1.0";

// -----------------------------------------------------------------------------
// Post metrics
// -----------------------------------------------------------------------------

export async function fetchPostMetrics(
  accessToken: string,
  platformPostId: string,
  opts: FetchOpts = {},
): Promise<FetchResult<PostMetrics>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const metric = "views,likes,replies,reposts,quotes";
  const url = `${TH_BASE}/${encodeURIComponent(platformPostId)}/insights?metric=${metric}&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const res = await fetch(url, { signal: timeoutSignal(timeoutMs) });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractThreadsError(json) || `Threads insights ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    const data = (json as { data?: Array<{ name: string; values?: Array<{ value: unknown }> }> })?.data ?? [];
    const get = (name: string): number => {
      const v = data.find((d) => d.name === name)?.values?.[0]?.value;
      return typeof v === "number" ? v : (typeof v === "string" ? Number(v) || 0 : 0);
    };

    const views = get("views");
    const likes = get("likes");
    const comments = get("replies"); // Threads llama "replies" a comments
    const reposts = get("reposts");
    const quotes = get("quotes");
    const shares = reposts + quotes; // aproximación

    return {
      ok: true,
      impressions: views,
      reach: 0,
      likes,
      comments,
      shares,
      saves: 0,
      clicks: 0,
      engagement_rate: computeEngagementRate({
        likes, comments, shares, saves: 0, reach: 0, impressions: views,
      }),
      raw: json,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `threads.fetchPostMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

// -----------------------------------------------------------------------------
// Account metrics
// -----------------------------------------------------------------------------

export async function fetchAccountMetrics(
  accessToken: string,
  accountId: string,
  opts: FetchOpts = {},
): Promise<FetchResult<AccountMetrics>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url = `${TH_BASE}/${encodeURIComponent(accountId)}?fields=followers_count&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const res = await fetch(url, { signal: timeoutSignal(timeoutMs) });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractThreadsError(json) || `Threads account ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    const j = json as Record<string, unknown>;
    const followers = Number(j.followers_count ?? 0);

    return {
      ok: true,
      followers,
      followers_delta_30d: 0,
      posts_published_30d: 0,
      total_engagement_30d: 0,
      avg_engagement_rate_30d: 0,
      raw: json,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `threads.fetchAccountMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

function extractThreadsError(raw: unknown): string | null {
  const j = raw as { error?: { message?: string; code?: number } };
  if (j?.error?.message) return `Threads[${j.error.code ?? "?"}]: ${j.error.message}`;
  return null;
}
