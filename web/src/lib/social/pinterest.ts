/**
 * Sprint 25 · Pinterest API v5 integration (2026)
 *
 * Endpoints:
 *   - OAuth:       https://www.pinterest.com/oauth/
 *   - Token:       https://api.pinterest.com/v5/oauth/token
 *   - User:        https://api.pinterest.com/v5/user_account
 *   - Boards:      https://api.pinterest.com/v5/boards
 *   - Pins:        https://api.pinterest.com/v5/pins
 *   - Media uplo:  https://api.pinterest.com/v5/media
 *
 * Rate limits (per docs 2026): 1000 calls / hour / user. Create-pin sub-limit
 * is ~10 pins / hour / user before soft-throttling.
 *
 * IMPORTANT:
 *   - Never log tokens in clear text.
 *   - All fetch calls use AbortSignal.timeout(30000).
 *   - Recoverable errors return { ok: false, error, retryable }.
 */

const AUTH_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const API_BASE = "https://api.pinterest.com/v5";
const FETCH_TIMEOUT_MS = 30_000;

export const PINTEREST_SCOPES = [
  "pins:read",
  "pins:write",
  "boards:read",
  "boards:write",
  "user_accounts:read",
] as const;

export type PinterestAccountType = "PINNER" | "BUSINESS";

export type PinterestPublishResult =
  | {
      ok: true;
      pin_id: string;
      pin_url: string;
    }
  | { ok: false; error: string; retryable: boolean };

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------

export function initPinterestAuth(
  clientId: string,
  redirectUri: string,
  scopes: readonly string[] = PINTEREST_SCOPES,
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

export interface PinterestTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: "bearer";
  expires_in: number; // 30 days
  refresh_token_expires_in?: number; // 1 year
  scope: string;
}

/**
 * Exchange authorization code for access + refresh token.
 * Pinterest requires Basic auth with base64(appId:appSecret) for /v5/oauth/token.
 */
export async function exchangePinterestCode(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
): Promise<PinterestTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `pinterest.exchangeCode failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as PinterestTokenResponse;
}

export async function refreshPinterestToken(
  refreshToken: string,
  appId: string,
  appSecret: string,
): Promise<PinterestTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `pinterest.refreshToken failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as PinterestTokenResponse;
}

// -----------------------------------------------------------------------------
// Identity + Boards
// -----------------------------------------------------------------------------

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export interface PinterestUser {
  username: string;
  account_type: PinterestAccountType;
  profile_image?: string;
  website_url?: string;
  id?: string;
}

export async function getPinterestUser(
  accessToken: string,
): Promise<PinterestUser> {
  const res = await fetch(`${API_BASE}/user_account`, {
    headers: jsonHeaders(accessToken),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `pinterest.getUser failed (${res.status}): ${json?.message ?? json?.error ?? "unknown"}`,
    );
  }
  return json as PinterestUser;
}

export interface PinterestBoard {
  id: string;
  name: string;
  description?: string;
  privacy?: "PUBLIC" | "PROTECTED" | "SECRET";
  pin_count?: number;
  owner?: { username?: string };
}

export async function listPinterestBoards(
  accessToken: string,
  pageSize = 100,
): Promise<PinterestBoard[]> {
  const url = new URL(`${API_BASE}/boards`);
  url.searchParams.set("page_size", String(Math.min(pageSize, 100)));

  const boards: PinterestBoard[] = [];
  let bookmark: string | undefined;
  do {
    if (bookmark) url.searchParams.set("bookmark", bookmark);
    const res = await fetch(url.toString(), {
      headers: jsonHeaders(accessToken),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(
        `pinterest.listBoards failed (${res.status}): ${json?.message ?? "unknown"}`,
      );
    }
    boards.push(...((json.items ?? []) as PinterestBoard[]));
    bookmark = json.bookmark;
  } while (bookmark && boards.length < 500);
  return boards;
}

// -----------------------------------------------------------------------------
// Pins
// -----------------------------------------------------------------------------

export type PinterestMediaSource =
  | {
      source_type: "image_url";
      url: string;
    }
  | {
      source_type: "image_base64";
      content_type: "image/jpeg" | "image/png";
      data: string;
    }
  | {
      source_type: "video_id";
      media_id: string;
      cover_image_url?: string;
    }
  | {
      source_type: "multiple_image_urls";
      items: Array<{ url: string; title?: string; description?: string; link?: string }>;
      index?: number;
    };

export interface CreatePinterestPinParams {
  accessToken: string;
  boardId: string;
  title?: string; // <= 100 chars
  description?: string; // <= 500 chars
  mediaSource: PinterestMediaSource;
  link?: string; // destination URL
  altText?: string; // <= 500 chars
  boardSectionId?: string;
  parentPinId?: string;
}

/**
 * Create a Pin on the specified board.
 * Endpoint: POST /v5/pins
 * Quirk: soft rate limit ~10 create-pin calls / hour / user.
 */
export async function createPinterestPin(
  params: CreatePinterestPinParams,
): Promise<PinterestPublishResult> {
  const {
    accessToken,
    boardId,
    title,
    description,
    mediaSource,
    link,
    altText,
    boardSectionId,
    parentPinId,
  } = params;

  if (!boardId) {
    return { ok: false, error: "boardId is required", retryable: false };
  }
  if (!mediaSource) {
    return { ok: false, error: "mediaSource is required", retryable: false };
  }

  const body: Record<string, unknown> = {
    board_id: boardId,
    media_source: mediaSource,
  };
  if (title) body.title = title.slice(0, 100);
  if (description) body.description = description.slice(0, 500);
  if (link) body.link = link;
  if (altText) body.alt_text = altText.slice(0, 500);
  if (boardSectionId) body.board_section_id = boardSectionId;
  if (parentPinId) body.parent_pin_id = parentPinId;

  try {
    const res = await fetch(`${API_BASE}/pins`, {
      method: "POST",
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = await res.json();
    if (!res.ok) {
      const errMsg = json?.message ?? json?.error ?? "unknown";
      const retryable =
        res.status >= 500 ||
        res.status === 429 ||
        /rate.?limit/i.test(String(errMsg));
      return {
        ok: false,
        error: `pinterest.createPin failed (${res.status}): ${errMsg}`,
        retryable,
      };
    }
    const pinId = json.id as string;
    return {
      ok: true,
      pin_id: pinId,
      pin_url: `https://www.pinterest.com/pin/${pinId}/`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `pinterest.createPin exception: ${msg}`,
      retryable: /timeout|ENOTFOUND|ECONNRESET|5\d\d/i.test(msg),
    };
  }
}
