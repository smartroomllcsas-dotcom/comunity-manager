// Sprint 25 · Agente K — LinkedIn analytics provider.
//
// LinkedIn Marketing/Community API (REST 2026):
//   Social actions (post-level engagement):
//     GET https://api.linkedin.com/rest/socialActions/{urn}
//       Header: LinkedIn-Version: 202410 (mensual)
//     Response: { likesSummary: { totalLikes }, commentsSummary: { aggregatedTotalComments } }
//
//   Post statistics (impressions + shares) — SÓLO disponible para posts de Company Page,
//   NO para posts personales. Ese es el quirk grande de LinkedIn analytics 2026.
//     GET /rest/organizationalEntityShareStatistics?q=organizationalEntity
//         &organizationalEntity={org-urn}&shares[0]={post-urn}
//
//   Organization stats (account-level):
//     GET /rest/organizationalEntityFollowerStatistics?q=organizationalEntity
//         &organizationalEntity={org-urn}
//     GET /rest/organizations/{id}?fields=(name,vanityName)
//
// Quirk: LinkedIn no expone impressions/reach para posts de perfil personal
//        (linkedin-personal). En ese caso devolvemos likes+comments y dejamos
//        impressions/reach en 0. El dashboard debe advertirlo (ver AnalyticsDashboard).

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

const LI_BASE = "https://api.linkedin.com/rest";
const LI_VERSION = process.env.LINKEDIN_API_VERSION || "202410";

function baseHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LI_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

// -----------------------------------------------------------------------------
// Post metrics
// -----------------------------------------------------------------------------

export async function fetchPostMetrics(
  accessToken: string,
  platformPostId: string,
  opts: FetchOpts = {},
): Promise<FetchResult<PostMetrics>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const isCompany = opts.subKind === "linkedin-company";

  // 1) socialActions → likes + comments
  const socialUrl = `${LI_BASE}/socialActions/${encodeURIComponent(platformPostId)}`;
  try {
    const socialRes = await fetch(socialUrl, {
      signal: timeoutSignal(timeoutMs),
      headers: baseHeaders(accessToken),
    });
    const socialJson: unknown = await socialRes.json().catch(() => ({}));

    if (!socialRes.ok) {
      return {
        ok: false,
        error: extractLIError(socialJson) || `LinkedIn social ${socialRes.status}`,
        retryable: isRetryableStatus(socialRes.status),
      };
    }

    const sj = socialJson as {
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { aggregatedTotalComments?: number };
    };
    const likes = Number(sj.likesSummary?.totalLikes ?? 0);
    const comments = Number(sj.commentsSummary?.aggregatedTotalComments ?? 0);

    let impressions = 0;
    let reach = 0;
    let shares = 0;
    let clicks = 0;
    let statsJson: unknown = null;

    // 2) Sólo company pages: organizationalEntityShareStatistics
    if (isCompany && opts.subKind === "linkedin-company") {
      // urn del post: urn:li:share:{id} o urn:li:ugcPost:{id}
      // Necesitamos el urn de la organización → pasado en `platformPostId` como
      // "orgUrn::postUrn" cuando el caller lo tiene, o el cron lo omite y
      // aceptamos 0 en impressions.
      const [maybeOrgUrn, maybePostUrn] = platformPostId.split("::");
      const orgUrn = maybePostUrn ? maybeOrgUrn : null;
      const postUrn = maybePostUrn || platformPostId;

      if (orgUrn) {
        const statsUrl =
          `${LI_BASE}/organizationalEntityShareStatistics?q=organizationalEntity` +
          `&organizationalEntity=${encodeURIComponent(orgUrn)}` +
          `&shares[0]=${encodeURIComponent(postUrn)}`;

        const statsRes = await fetch(statsUrl, {
          signal: timeoutSignal(timeoutMs),
          headers: baseHeaders(accessToken),
        });
        statsJson = await statsRes.json().catch(() => ({}));

        if (statsRes.ok) {
          const sj2 = statsJson as {
            elements?: Array<{
              totalShareStatistics?: {
                impressionCount?: number;
                uniqueImpressionsCount?: number;
                shareCount?: number;
                clickCount?: number;
              };
            }>;
          };
          const el = sj2.elements?.[0]?.totalShareStatistics;
          if (el) {
            impressions = Number(el.impressionCount ?? 0);
            reach = Number(el.uniqueImpressionsCount ?? 0);
            shares = Number(el.shareCount ?? 0);
            clicks = Number(el.clickCount ?? 0);
          }
        }
      }
    }

    return {
      ok: true,
      impressions,
      reach,
      likes,
      comments,
      shares,
      saves: 0, // LinkedIn no expone saves
      clicks,
      engagement_rate: computeEngagementRate({
        likes, comments, shares, saves: 0, reach, impressions,
      }),
      raw: { social: socialJson, stats: statsJson },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `linkedin.fetchPostMetrics: ${msg}`,
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

  // accountId esperado como urn:li:organization:{id}
  const orgUrn = accountId.startsWith("urn:li:organization:")
    ? accountId
    : `urn:li:organization:${accountId}`;

  const url =
    `${LI_BASE}/organizationalEntityFollowerStatistics?q=organizationalEntity` +
    `&organizationalEntity=${encodeURIComponent(orgUrn)}`;

  try {
    const res = await fetch(url, {
      signal: timeoutSignal(timeoutMs),
      headers: baseHeaders(accessToken),
    });
    const json: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: extractLIError(json) || `LinkedIn follower stats ${res.status}`,
        retryable: isRetryableStatus(res.status),
      };
    }

    // followerCounts es un array por segmentación; sumamos el total.
    const j = json as {
      elements?: Array<{
        followerCounts?: {
          organicFollowerCount?: number;
          paidFollowerCount?: number;
        };
      }>;
    };
    const el = j.elements?.[0]?.followerCounts;
    const followers = Number(el?.organicFollowerCount ?? 0) + Number(el?.paidFollowerCount ?? 0);

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
      error: `linkedin.fetchAccountMetrics: ${msg}`,
      retryable: /abort|timeout|network|econnreset/i.test(msg),
    };
  }
}

function extractLIError(raw: unknown): string | null {
  const j = raw as { message?: string; status?: number; serviceErrorCode?: number };
  if (j?.message) return `LinkedIn[${j.status ?? "?"}/${j.serviceErrorCode ?? "?"}]: ${j.message}`;
  return null;
}
