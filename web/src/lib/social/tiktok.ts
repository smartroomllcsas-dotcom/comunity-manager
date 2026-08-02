/**
 * Sprint 24 · TikTok for Business — Content Posting API integration (2026)
 *
 * Endpoints:
 *   - OAuth:          https://www.tiktok.com/v2/auth/authorize/
 *   - Token exchange: https://open.tiktokapis.com/v2/oauth/token/
 *   - Content Posting: https://open.tiktokapis.com/v2/post/publish/video/init/
 *
 * Rate limit (per docs 2026): 6 publish requests / minute / user.
 * Videos must be provided as a public URL (PULL_FROM_URL flow) OR uploaded
 * via FILE_UPLOAD (chunked). We use PULL_FROM_URL — caller uploads media
 * to Supabase Storage and passes the signed URL.
 *
 * IMPORTANT:
 *   - Never log tokens in clear text.
 *   - All fetch calls use AbortSignal.timeout(30000).
 *   - Recoverable errors return { ok: false, error, retryable }; hard
 *     failures throw so Inngest retries kick in only for infra faults.
 */

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API_BASE = "https://open.tiktokapis.com/v2";
const FETCH_TIMEOUT_MS = 30_000;

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "video.publish",
  "video.upload",
] as const;

export type TikTokPrivacy =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "SELF_ONLY";

export type TikTokPublishResult =
  | { ok: true; publish_id: string; status: string }
  | { ok: false; error: string; retryable: boolean };

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------

/**
 * Build the TikTok authorization URL. Caller must persist `state` server-side
 * (cm_oauth_states) before redirecting.
 */
export function initTikTokAuth(
  clientKey: string,
  redirectUri: string,
  scopes: readonly string[] = TIKTOK_SCOPES,
  state?: string,
): string {
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: scopes.join(","),
    redirect_uri: redirectUri,
  });
  if (state) params.set("state", state);
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  open_id: string;
  scope: string;
  token_type: "Bearer";
}

/**
 * Exchange authorization code for access + refresh token.
 * Returns the raw payload from TikTok (open_id included).
 */
export async function exchangeTikTokCode(
  code: string,
  clientKey: string,
  clientSecret: string,
  redirectUri: string,
): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `tiktok.exchangeCode failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as TikTokTokenResponse;
}

/**
 * Refresh an access token before it expires.
 */
export async function refreshTikTokToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string,
): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `tiktok.refreshToken failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as TikTokTokenResponse;
}

// -----------------------------------------------------------------------------
// Publishing
// -----------------------------------------------------------------------------

async function tiktokPost<T>(
  path: string,
  accessToken: string,
  payload: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `tiktok API ${path} failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  return json as T;
}

export interface PublishVideoParams {
  accessToken: string;
  openId: string; // TikTok user identifier (kept for RLS parity)
  videoUrl: string; // MUST be publicly reachable HTTPS URL
  caption: string;
  hashtags?: string[];
  privacy?: TikTokPrivacy;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

/**
 * Publish a video via TikTok Content Posting API (PULL_FROM_URL flow).
 * 2 phases: init upload → poll status.
 * Returns publish_id (equivalent to a container ID).
 */
export async function publishTikTokVideo(
  params: PublishVideoParams,
): Promise<TikTokPublishResult> {
  const {
    accessToken,
    videoUrl,
    caption,
    hashtags = [],
    privacy = "PUBLIC_TO_EVERYONE",
    disableComment = false,
    disableDuet = false,
    disableStitch = false,
  } = params;

  const title =
    [caption, hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2200); // TikTok caption cap

  try {
    const initRes = await tiktokPost<{
      data: { publish_id: string };
      error?: { code?: string; message?: string };
    }>("/post/publish/video/init/", accessToken, {
      post_info: {
        title,
        privacy_level: privacy,
        disable_duet: disableDuet,
        disable_comment: disableComment,
        disable_stitch: disableStitch,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    });

    if (!initRes.data?.publish_id) {
      return {
        ok: false,
        error: `tiktok init returned no publish_id: ${initRes.error?.message ?? "unknown"}`,
        retryable: false,
      };
    }

    // Poll status up to ~40s (video pull can take time on TikTok's side).
    const publishId = initRes.data.publish_id;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await tiktokPost<{
        data: { status: string; fail_reason?: string };
      }>("/post/publish/status/fetch/", accessToken, {
        publish_id: publishId,
      });
      const s = status.data?.status ?? "PROCESSING";
      if (s === "PUBLISH_COMPLETE") {
        return { ok: true, publish_id: publishId, status: s };
      }
      if (s === "FAILED") {
        return {
          ok: false,
          error: `tiktok publish failed: ${status.data?.fail_reason ?? "unknown"}`,
          retryable: false,
        };
      }
    }
    // Timeout waiting for TikTok — leave post_id available so caller can poll later.
    return { ok: true, publish_id: publishId, status: "PENDING" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 5xx / network → retryable; 4xx → hard fail.
    const retryable = /\b5\d\d\b|timeout|ENOTFOUND|ECONNRESET/i.test(msg);
    return { ok: false, error: msg, retryable };
  }
}

export interface PublishPhotoParams {
  accessToken: string;
  openId: string;
  imageUrls: string[]; // 1..35 public HTTPS URLs
  caption: string;
  privacy?: TikTokPrivacy;
}

/**
 * Publish a photo carousel (or single image) with a text caption.
 */
export async function publishTikTokPhoto(
  params: PublishPhotoParams,
): Promise<TikTokPublishResult> {
  const {
    accessToken,
    imageUrls,
    caption,
    privacy = "PUBLIC_TO_EVERYONE",
  } = params;

  if (imageUrls.length < 1 || imageUrls.length > 35) {
    return {
      ok: false,
      error: `tiktok photo requires 1..35 images, got ${imageUrls.length}`,
      retryable: false,
    };
  }

  try {
    const initRes = await tiktokPost<{
      data: { publish_id: string };
    }>("/post/publish/content/init/", accessToken, {
      post_info: {
        title: caption.slice(0, 90),
        description: caption.slice(0, 2200),
        privacy_level: privacy,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: imageUrls,
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    });

    if (!initRes.data?.publish_id) {
      return {
        ok: false,
        error: "tiktok photo init returned no publish_id",
        retryable: false,
      };
    }
    return {
      ok: true,
      publish_id: initRes.data.publish_id,
      status: "SUBMITTED",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryable = /\b5\d\d\b|timeout|ENOTFOUND|ECONNRESET/i.test(msg);
    return { ok: false, error: msg, retryable };
  }
}

/**
 * Fetch basic user info (username, avatar) — used post-OAuth to populate
 * cm_social_accounts.account_name.
 */
export async function getTikTokUser(
  accessToken: string,
): Promise<{ open_id: string; union_id: string; display_name: string; avatar_url?: string }> {
  const url = new URL(`${API_BASE}/user/info/`);
  url.searchParams.set(
    "fields",
    "open_id,union_id,avatar_url,display_name,username",
  );
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `tiktok.getUser failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  return json.data?.user ?? json.data ?? {};
}
