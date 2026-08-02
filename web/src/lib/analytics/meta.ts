// Sprint 25 · Agente K — Meta (Facebook + Instagram) analytics provider.
//
// Docs 2026 (Graph API v21.0):
//   IG media insights:
//     GET /{ig-media-id}/insights?metric=impressions,reach,likes,comments,shares,saves,video_views
//   IG reels insights:
//     GET /{ig-media-id}/insights?metric=plays,reach,likes,comments,shares,saves,total_interactions
//   FB post insights:
//     GET /{post-id}/insights?metric=post_impressions,post_impressions_unique,post_reactions_by_type_total,post_clicks
//
// Account level:
//   IG business account:
//     GET /{ig-user-id}?fields=followers_count,media_count
//     GET /{ig-user-id}/insights?metric=follower_count,reach&period=day&since=<epoch>
//   FB page:
//     GET /{page-id}?fields=fan_count
//     GET /{page-id}/insights?metric=page_fans,page_impressions&period=day&since=<epoch>
//
// Distinguimos IG vs FB por `opts.subKind` (ig-feed/ig-reel/ig-story/fb).

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

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// -----------------------------------------------------------------------------
// Post metrics
// -----------------------------------------------------------------------------

export async function fetchPostMetrics(
  accessToken: string,
  platformPostId: string,
  opts: FetchOpts = {},
): Promise<FetchResult<PostMetrics>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const isReel = opts.subKind === "ig-reel";
  const isIG = opts.subKind?.startsWith("ig-") ?? false;

  const metric = isReel
    ? "plays,reach,likes,comments,shares,saves,total_interactions"
    : isIG
      ? "impressions,reach,likes,comments,shares,saves,video_views"
      : "post_impressions,post_impressions_unique,post_reactions_by_type_total,post_clicks";

  const url = `${GRAPH_BASE}/${encodeURIComponent(platformPostId)}/insights?metric=${metric}&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const res = await fetch(url, { signal: timeoutSignal(timeoutMs) });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractMetaError(json) || `Meta insights ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    const parsed = parseInsights(json, { isIG, isReel });
    return {
      ok: true,
      ...parsed,
      engagement_rate: computeEngagementRate(parsed),
      raw: json,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `meta.fetchPostMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

/**
 * Parse Meta insights payload. Meta devuelve:
 *   { data: [ { name: "impressions", values: [ { value: N } ] }, ... ] }
 */
function parseInsights(
  raw: unknown,
  ctx: { isIG: boolean; isReel: boolean },
): Omit<PostMetrics, "engagement_rate" | "raw"> {
  const data = (raw as { data?: Array<{ name: string; values?: Array<{ value: unknown }> }> })?.data ?? [];
  const get = (name: string): number => {
    const item = data.find((d) => d.name === name);
    const v = item?.values?.[0]?.value;
    if (typeof v === "number") return v;
    // FB devuelve `post_reactions_by_type_total` como objeto {like: N, love: N, ...}
    if (v && typeof v === "object") {
      return Object.values(v as Record<string, unknown>).reduce<number>(
        (acc, cur) => acc + (typeof cur === "number" ? cur : 0), 0,
      );
    }
    return 0;
  };

  if (ctx.isReel) {
    // Reels expone `plays` en vez de impressions y `total_interactions` como engagement total.
    const reach = get("reach");
    const plays = get("plays");
    return {
      impressions: plays,
      reach,
      likes: get("likes"),
      comments: get("comments"),
      shares: get("shares"),
      saves: get("saves"),
      clicks: 0,
      video_views: plays,
      video_completion_rate: undefined,
    };
  }

  if (ctx.isIG) {
    return {
      impressions: get("impressions"),
      reach: get("reach"),
      likes: get("likes"),
      comments: get("comments"),
      shares: get("shares"),
      saves: get("saves"),
      clicks: 0,
      video_views: get("video_views") || undefined,
    };
  }

  // Facebook page post
  return {
    impressions: get("post_impressions"),
    reach: get("post_impressions_unique"),
    likes: get("post_reactions_by_type_total"),
    comments: 0, // FB no lo expone por insights; fallback 0
    shares: 0,
    saves: 0,
    clicks: get("post_clicks"),
  };
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
  const isIG = opts.subKind?.startsWith("ig-") ?? false;

  const fields = isIG ? "followers_count,media_count" : "fan_count";
  const url = `${GRAPH_BASE}/${encodeURIComponent(accountId)}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const res = await fetch(url, { signal: timeoutSignal(timeoutMs) });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractMetaError(json) || `Meta account ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    const j = json as Record<string, unknown>;
    const followers = isIG
      ? Number(j.followers_count ?? 0)
      : Number(j.fan_count ?? 0);

    // followers_delta_30d + posts_published_30d + engagement 30d los rellena
    // el cron a partir de snapshots previos + cm_scheduled_posts. Aquí sólo
    // devolvemos el followers actual — el resto queda en 0 y se agrega arriba.
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
      error: `meta.fetchAccountMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

function extractMetaError(raw: unknown): string | null {
  const j = raw as { error?: { message?: string; code?: number; type?: string } };
  if (j?.error?.message) return `Meta[${j.error.code ?? "?"}/${j.error.type ?? "?"}]: ${j.error.message}`;
  return null;
}
