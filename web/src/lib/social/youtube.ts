/**
 * Sprint 25 · YouTube Data API v3 integration (2026)
 *
 * Endpoints:
 *   - OAuth:            https://accounts.google.com/o/oauth2/v2/auth
 *   - Token exchange:   https://oauth2.googleapis.com/token
 *   - Channel:          GET  https://www.googleapis.com/youtube/v3/channels
 *   - Video upload:     POST https://www.googleapis.com/upload/youtube/v3/videos
 *
 * Quota (per docs 2026): 10,000 units / day / project.
 *   - videos.insert (upload) = 1600 units
 *   - channels.list           = 1 unit
 *
 * Upload strategy: we fetch the caller-supplied video URL server-side and
 * stream the bytes as multipart/related — the standard non-resumable path
 * that YouTube supports for Shorts (< 256 MB). Callers must supply an HTTPS
 * URL reachable from our servers (typically a Supabase Storage signed URL).
 *
 * Shorts detection: if the source video is <= 60s vertical and title/desc
 * contains #Shorts, YouTube auto-classifies it as a Short. We rely on the
 * caller (UI) to add the tag — no client-side probing here.
 *
 * IMPORTANT:
 *   - Never log tokens in clear text.
 *   - All fetch calls use AbortSignal.timeout(30000) EXCEPT the video upload
 *     itself, which uses 5 minutes (video streaming can be slow).
 *   - Recoverable errors return { ok: false, error, retryable }.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";
const FETCH_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
] as const;

export type YouTubePrivacy = "public" | "unlisted" | "private";

export type YouTubePublishResult =
  | {
      ok: true;
      video_id: string;
      video_url: string;
      status: string;
    }
  | { ok: false; error: string; retryable: boolean };

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------

/**
 * Build the Google OAuth authorization URL for YouTube. Caller must persist
 * `state` server-side (cm_oauth_states) before redirecting.
 */
export function initYouTubeAuth(
  clientId: string,
  redirectUri: string,
  scopes: readonly string[] = YOUTUBE_SCOPES,
  state?: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline", // needed to get refresh_token
    prompt: "consent", // force refresh_token issuance on re-auth
    include_granted_scopes: "true",
  });
  if (state) params.set("state", state);
  return `${AUTH_URL}?${params.toString()}`;
}

export interface YouTubeTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
  id_token?: string;
}

/**
 * Exchange authorization code for access + refresh token.
 */
export async function exchangeYouTubeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<YouTubeTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `youtube.exchangeCode failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as YouTubeTokenResponse;
}

/**
 * Refresh an access token before it expires.
 * Google refresh tokens do not expire unless revoked or unused for 6 months.
 */
export async function refreshYouTubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<YouTubeTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `youtube.refreshToken failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as YouTubeTokenResponse;
}

// -----------------------------------------------------------------------------
// Identity
// -----------------------------------------------------------------------------

export interface YouTubeChannel {
  channel_id: string;
  title: string;
  thumbnail?: string;
  description?: string;
  custom_url?: string;
}

/**
 * Fetch the authenticated user's primary YouTube channel.
 * Cost: 1 quota unit.
 */
export async function getYouTubeChannel(
  accessToken: string,
): Promise<YouTubeChannel> {
  const url = `${API_BASE}/channels?part=snippet&mine=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `youtube.getChannel failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  const item = (json.items ?? [])[0];
  if (!item) {
    throw new Error("youtube.getChannel: no channel found for this account");
  }
  const s = item.snippet ?? {};
  return {
    channel_id: item.id,
    title: s.title ?? "YouTube channel",
    thumbnail:
      s.thumbnails?.medium?.url ??
      s.thumbnails?.default?.url ??
      undefined,
    description: s.description,
    custom_url: s.customUrl,
  };
}

// -----------------------------------------------------------------------------
// Publishing — Shorts / long-form
// -----------------------------------------------------------------------------

export interface PublishYouTubeShortParams {
  accessToken: string;
  videoUrl: string; // HTTPS URL, server-side fetchable (e.g. Supabase signed URL)
  title: string; // <= 100 chars
  description?: string; // <= 5000 chars
  tags?: string[]; // combined <= 500 chars
  categoryId?: string; // default '22' = People & Blogs
  privacyStatus?: YouTubePrivacy; // default 'public'
  publishAt?: string; // ISO8601, requires privacyStatus='private' scheduling
  madeForKids?: boolean; // default false
  defaultLanguage?: string; // e.g. 'es'
}

/**
 * Publish a YouTube Short (or regular video) via the videos.insert endpoint
 * using multipart/related upload.
 *
 * Cost: 1600 quota units.
 */
export async function publishYouTubeShort(
  params: PublishYouTubeShortParams,
): Promise<YouTubePublishResult> {
  const {
    accessToken,
    videoUrl,
    title,
    description = "",
    tags = [],
    categoryId = "22",
    privacyStatus = "public",
    publishAt,
    madeForKids = false,
    defaultLanguage,
  } = params;

  if (!videoUrl) {
    return { ok: false, error: "videoUrl is required", retryable: false };
  }
  const safeTitle = title.slice(0, 100);
  const safeDesc = description.slice(0, 5000);

  // 1. Fetch the video bytes server-side.
  let videoBytes: ArrayBuffer;
  let contentType = "video/mp4";
  try {
    const dl = await fetch(videoUrl, {
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!dl.ok) {
      return {
        ok: false,
        error: `videoUrl download failed (${dl.status})`,
        retryable: dl.status >= 500,
      };
    }
    contentType = dl.headers.get("content-type") ?? contentType;
    videoBytes = await dl.arrayBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `videoUrl download exception: ${msg}`,
      retryable: /timeout|ENOTFOUND|ECONNRESET/i.test(msg),
    };
  }

  // 2. Build the multipart/related body.
  const snippet: Record<string, unknown> = {
    title: safeTitle,
    description: safeDesc,
    tags,
    categoryId,
  };
  if (defaultLanguage) snippet.defaultLanguage = defaultLanguage;

  const status: Record<string, unknown> = {
    privacyStatus: publishAt ? "private" : privacyStatus,
    selfDeclaredMadeForKids: madeForKids,
  };
  if (publishAt) status.publishAt = publishAt;

  const metadata = JSON.stringify({ snippet, status });
  const boundary = `yt-boundary-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const enc = new TextEncoder();
  const header = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      metadata +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const footer = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(
    header.byteLength + videoBytes.byteLength + footer.byteLength,
  );
  body.set(header, 0);
  body.set(new Uint8Array(videoBytes), header.byteLength);
  body.set(footer, header.byteLength + videoBytes.byteLength);

  // 3. Upload.
  try {
    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.byteLength),
      },
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    const json = await res.json();
    if (!res.ok) {
      const errMsg =
        json?.error?.message ?? json?.error_description ?? "unknown";
      const retryable =
        res.status >= 500 ||
        res.status === 429 ||
        /quotaExceeded|rateLimitExceeded/i.test(String(errMsg));
      return {
        ok: false,
        error: `youtube.videos.insert failed (${res.status}): ${errMsg}`,
        retryable,
      };
    }
    const videoId = json.id as string;
    return {
      ok: true,
      video_id: videoId,
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      status: json?.status?.uploadStatus ?? "uploaded",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `youtube.videos.insert exception: ${msg}`,
      retryable: /timeout|ENOTFOUND|ECONNRESET|5\d\d/i.test(msg),
    };
  }
}
