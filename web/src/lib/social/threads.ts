/**
 * Sprint 24 · Threads API integration (Meta Graph, separate host).
 *
 * Uses the SAME Meta App as Instagram/Facebook (META_APP_ID/SECRET) but
 * with dedicated scopes and a dedicated host: graph.threads.net.
 *
 * Publish flow is 2-step (identical to Instagram): create container → publish.
 * Rate limit (per docs 2026): 250 posts / 24h / user.
 */

const AUTH_URL = "https://threads.net/oauth/authorize";
const TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const LONG_LIVED_URL = "https://graph.threads.net/access_token";
const API_BASE = "https://graph.threads.net/v1.0";
const FETCH_TIMEOUT_MS = 30_000;

export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_replies",
  "threads_read_replies",
] as const;

export type ThreadsMediaType = "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";

export function initThreadsAuth(
  clientId: string,
  redirectUri: string,
  scopes: readonly string[] = THREADS_SCOPES,
  state?: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(","),
  });
  if (state) params.set("state", state);
  return `${AUTH_URL}?${params.toString()}`;
}

export interface ThreadsShortTokenResponse {
  access_token: string;
  user_id: string; // Threads user ID (numeric string)
}

export interface ThreadsLongTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number; // ~60 days
}

/**
 * Exchange the auth code for a short-lived token, then upgrade to a
 * long-lived (60 day) token in a single call — same pattern as Meta Graph.
 */
export async function exchangeThreadsCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ access_token: string; user_id: string; expires_in: number }> {
  const shortBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const shortRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: shortBody,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const shortJson = (await shortRes.json()) as
    | ThreadsShortTokenResponse
    | { error: unknown; error_message?: string };
  if (!shortRes.ok || "error" in shortJson) {
    const err = "error_message" in shortJson ? shortJson.error_message : "unknown";
    throw new Error(
      `threads.exchangeCode short-token failed (${shortRes.status}): ${err}`,
    );
  }

  // Upgrade to long-lived (GET with query params).
  const longUrl = new URL(LONG_LIVED_URL);
  longUrl.searchParams.set("grant_type", "th_exchange_token");
  longUrl.searchParams.set("client_secret", clientSecret);
  longUrl.searchParams.set("access_token", shortJson.access_token);
  const longRes = await fetch(longUrl.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const longJson = (await longRes.json()) as
    | ThreadsLongTokenResponse
    | { error: { message: string } };
  if (!longRes.ok || "error" in longJson) {
    const err = "error" in longJson ? longJson.error.message : "unknown";
    throw new Error(`threads.exchangeCode long-token failed (${longRes.status}): ${err}`);
  }
  return {
    access_token: longJson.access_token,
    user_id: shortJson.user_id,
    expires_in: longJson.expires_in,
  };
}

/**
 * Fetch basic Threads user (id, username, avatar).
 */
export async function getThreadsUser(
  accessToken: string,
): Promise<{ id: string; username: string; threads_profile_picture_url?: string; name?: string }> {
  const url = new URL(`${API_BASE}/me`);
  url.searchParams.set(
    "fields",
    "id,username,threads_profile_picture_url,name",
  );
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `threads.getUser failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  return json;
}

// -----------------------------------------------------------------------------
// Publishing (2-step: create container → publish)
// -----------------------------------------------------------------------------

export interface CreateContainerParams {
  accessToken: string;
  userId: string;
  mediaType: ThreadsMediaType;
  text?: string;
  imageUrl?: string; // public HTTPS URL
  videoUrl?: string; // public HTTPS URL
  isCarouselItem?: boolean;
  children?: string[]; // container IDs when mediaType === 'CAROUSEL'
  replyToId?: string; // for threaded replies
}

/**
 * Create a Threads media container. Returns the container ID that must be
 * passed to `publishThreadsContainer` after a short wait.
 */
export async function createThreadsContainer(
  params: CreateContainerParams,
): Promise<string> {
  const {
    accessToken,
    userId,
    mediaType,
    text,
    imageUrl,
    videoUrl,
    isCarouselItem,
    children,
    replyToId,
  } = params;

  const body = new URLSearchParams({
    media_type: mediaType,
    access_token: accessToken,
  });
  if (text) body.set("text", text.slice(0, 500)); // Threads cap
  if (imageUrl) body.set("image_url", imageUrl);
  if (videoUrl) body.set("video_url", videoUrl);
  if (isCarouselItem) body.set("is_carousel_item", "true");
  if (children && children.length > 0) body.set("children", children.join(","));
  if (replyToId) body.set("reply_to_id", replyToId);

  const res = await fetch(`${API_BASE}/${userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(
      `threads.createContainer failed (${res.status}): ${json?.error?.message ?? "no id"}`,
    );
  }
  return json.id as string;
}

/**
 * Publish a previously-created Threads container. Meta docs recommend
 * waiting ~30s between container creation and publish for VIDEO/CAROUSEL,
 * but TEXT can publish immediately. Caller handles the wait.
 */
export async function publishThreadsContainer(
  accessToken: string,
  userId: string,
  containerId: string,
): Promise<{ id: string; permalink?: string }> {
  const body = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });
  const res = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(
      `threads.publishContainer failed (${res.status}): ${json?.error?.message ?? "no id"}`,
    );
  }
  // Best-effort permalink lookup.
  const permalink = await fetch(
    `${API_BASE}/${json.id}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  )
    .then((r) => r.json())
    .then((j) => j.permalink)
    .catch(() => undefined);

  return { id: json.id, permalink };
}
