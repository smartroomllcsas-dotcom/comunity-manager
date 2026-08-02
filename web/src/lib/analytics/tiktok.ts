// Sprint 25 · Agente K — TikTok analytics provider.
//
// TikTok Business API (Content Posting v1.3):
//   POST https://business-api.tiktok.com/open_api/v1.3/business/video/list/
//   POST https://business-api.tiktok.com/open_api/v1.3/business/video/metrics/
//
// Quirks:
//   * TikTok obliga a POST + JSON body incluso para reads.
//   * `video_metrics` requiere `metrics_of_interest=[...]` explícito.
//   * El account_id se llama `business_id` y va como query param.

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

const TT_BASE = "https://business-api.tiktok.com/open_api/v1.3";

// -----------------------------------------------------------------------------
// Post metrics — POST /business/video/metrics/
// -----------------------------------------------------------------------------

export async function fetchPostMetrics(
  accessToken: string,
  platformPostId: string,
  opts: FetchOpts = {},
): Promise<FetchResult<PostMetrics>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url = `${TT_BASE}/business/video/metrics/`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: timeoutSignal(timeoutMs),
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_ids: [platformPostId],
        metrics: [
          "video_views",
          "reach",
          "likes",
          "comments",
          "shares",
          "saves",
          "profile_views",
          "full_video_watched_rate",
        ],
      }),
    });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractTTError(json) || `TikTok metrics ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    // TikTok payload: { data: { videos: [ { metrics: { ... } } ] } }
    const j = json as { data?: { videos?: Array<{ metrics?: Record<string, number> }> } };
    const m = j.data?.videos?.[0]?.metrics ?? {};

    const impressions = num(m.video_views);
    const reach = num(m.reach);
    const likes = num(m.likes);
    const comments = num(m.comments);
    const shares = num(m.shares);
    const saves = num(m.saves);
    const clicks = num(m.profile_views);
    const video_completion_rate = m.full_video_watched_rate != null
      ? Math.min(1, Math.max(0, Number(m.full_video_watched_rate)))
      : undefined;

    return {
      ok: true,
      impressions,
      reach,
      likes,
      comments,
      shares,
      saves,
      clicks,
      video_views: impressions,
      video_completion_rate,
      engagement_rate: computeEngagementRate({ likes, comments, shares, saves, reach, impressions }),
      raw: json,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `tiktok.fetchPostMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

// -----------------------------------------------------------------------------
// Account metrics — GET /business/get/?business_id=<id>&fields=[...]
// -----------------------------------------------------------------------------

export async function fetchAccountMetrics(
  accessToken: string,
  accountId: string,
  opts: FetchOpts = {},
): Promise<FetchResult<AccountMetrics>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const fields = encodeURIComponent(
    JSON.stringify(["followers_count", "likes_count", "video_count", "profile_views"]),
  );
  const url = `${TT_BASE}/business/get/?business_id=${encodeURIComponent(accountId)}&fields=${fields}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: timeoutSignal(timeoutMs),
      headers: {
        "Access-Token": accessToken,
      },
    });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractTTError(json) || `TikTok account ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    const j = json as { data?: Record<string, unknown> };
    const followers = num(j.data?.followers_count);

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
      error: `tiktok.fetchAccountMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractTTError(raw: unknown): string | null {
  const j = raw as { code?: number; message?: string };
  if (j?.message) return `TikTok[${j.code ?? "?"}]: ${j.message}`;
  return null;
}
