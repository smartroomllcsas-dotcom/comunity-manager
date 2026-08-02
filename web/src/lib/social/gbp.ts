/**
 * Sprint 25 · Google Business Profile API integration (2026)
 *
 * Endpoints:
 *   - OAuth:           https://accounts.google.com/o/oauth2/v2/auth
 *   - Token:           https://oauth2.googleapis.com/token
 *   - Account Mgmt:    https://mybusinessaccountmanagement.googleapis.com/v1
 *   - Business Info:   https://mybusinessbusinessinformation.googleapis.com/v1
 *   - Local Posts:     https://mybusiness.googleapis.com/v4
 *   - Reviews:         https://mybusiness.googleapis.com/v4
 *
 * Rate limits (per docs 2026): default 300 QPM per project, per API.
 * Location must be VERIFIED and PUBLISHED to accept posts; otherwise 403.
 *
 * IMPORTANT:
 *   - Never log tokens in clear text.
 *   - All fetch calls use AbortSignal.timeout(30000).
 *   - Recoverable errors return { ok: false, error, retryable }.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNT_MGMT_BASE =
  "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const MYBUSINESS_V4 = "https://mybusiness.googleapis.com/v4";
const FETCH_TIMEOUT_MS = 30_000;

export const GBP_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
] as const;

export type GBPLocalPostType = "STANDARD" | "EVENT" | "OFFER" | "ALERT";
export type GBPCTAType =
  | "BOOK"
  | "ORDER"
  | "SHOP"
  | "LEARN_MORE"
  | "SIGN_UP"
  | "CALL";

export type GBPPublishResult =
  | { ok: true; post_name: string; post_url?: string; state: string }
  | { ok: false; error: string; retryable: boolean };

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------

export function initGBPAuth(
  clientId: string,
  redirectUri: string,
  scopes: readonly string[] = GBP_SCOPES,
  state?: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  if (state) params.set("state", state);
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GBPTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
}

export async function exchangeGBPCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GBPTokenResponse> {
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
      `gbp.exchangeCode failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as GBPTokenResponse;
}

export async function refreshGBPToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GBPTokenResponse> {
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
      `gbp.refreshToken failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as GBPTokenResponse;
}

// -----------------------------------------------------------------------------
// Accounts + Locations discovery
// -----------------------------------------------------------------------------

function jsonHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export interface GBPAccount {
  name: string; // "accounts/{accountId}"
  accountName?: string;
  type?: string; // PERSONAL | LOCATION_GROUP | ORGANIZATION
  role?: string;
}

/**
 * List Google Business Profile accounts the authenticated user administers.
 */
export async function listGBPAccounts(
  accessToken: string,
): Promise<GBPAccount[]> {
  const res = await fetch(`${ACCOUNT_MGMT_BASE}/accounts`, {
    headers: jsonHeaders(accessToken),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `gbp.listAccounts failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  return (json.accounts ?? []) as GBPAccount[];
}

export interface GBPLocation {
  name: string; // "locations/{locationId}" (relative) — see quirk below
  title?: string;
  storefrontAddress?: unknown;
  primaryPhone?: string;
  websiteUri?: string;
  metadata?: {
    hasVoiceOfMerchant?: boolean;
    canOperateLocalPost?: boolean;
    placeId?: string;
    mapsUri?: string;
    newReviewUri?: string;
  };
}

/**
 * List locations for a given account. The Business Information API returns
 * `locations/{id}`; posting requires the full `accounts/{a}/locations/{l}`
 * form so we return the concatenated name for convenience.
 */
export async function listGBPLocations(
  accessToken: string,
  accountName: string, // "accounts/{accountId}"
): Promise<GBPLocation[]> {
  const readMask = encodeURIComponent(
    "name,title,storefrontAddress,primaryPhone,websiteUri,metadata",
  );
  const url = `${BUSINESS_INFO_BASE}/${accountName}/locations?readMask=${readMask}&pageSize=100`;
  const res = await fetch(url, {
    headers: jsonHeaders(accessToken),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `gbp.listLocations failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  const raw = (json.locations ?? []) as GBPLocation[];
  return raw.map((loc) => ({
    ...loc,
    name: loc.name?.startsWith("accounts/")
      ? loc.name
      : `${accountName}/${loc.name}`,
  }));
}

// -----------------------------------------------------------------------------
// Local Posts (v4 legacy — the only surface that still accepts posts)
// -----------------------------------------------------------------------------

export interface GBPMediaItem {
  mediaFormat: "PHOTO" | "VIDEO";
  sourceUrl: string;
}

export interface GBPCallToAction {
  actionType: GBPCTAType;
  url?: string;
}

export interface GBPEvent {
  title: string;
  schedule: {
    startDate: { year: number; month: number; day: number };
    startTime?: { hours: number; minutes?: number };
    endDate: { year: number; month: number; day: number };
    endTime?: { hours: number; minutes?: number };
  };
}

export interface PublishGBPPostParams {
  accessToken: string;
  locationName: string; // "accounts/{a}/locations/{l}"
  summary: string; // <= 1500 chars
  callToAction?: GBPCallToAction;
  media?: GBPMediaItem[];
  topicType?: GBPLocalPostType; // default 'STANDARD'
  languageCode?: string; // default 'es'
  event?: GBPEvent; // required when topicType === 'EVENT'
  offer?: {
    couponCode?: string;
    redeemOnlineUrl?: string;
    termsConditions?: string;
  };
}

/**
 * Publish a Local Post on a verified Business Profile location.
 * Endpoint: POST /v4/{name=accounts/*\/locations/*}/localPosts
 */
export async function publishGBPPost(
  params: PublishGBPPostParams,
): Promise<GBPPublishResult> {
  const {
    accessToken,
    locationName,
    summary,
    callToAction,
    media,
    topicType = "STANDARD",
    languageCode = "es",
    event,
    offer,
  } = params;

  if (!locationName || !locationName.includes("locations/")) {
    return {
      ok: false,
      error: "locationName must be 'accounts/{a}/locations/{l}'",
      retryable: false,
    };
  }

  const body: Record<string, unknown> = {
    languageCode,
    summary: summary.slice(0, 1500),
    topicType,
  };
  if (callToAction) body.callToAction = callToAction;
  if (media && media.length > 0) body.media = media;
  if (topicType === "EVENT" && event) body.event = event;
  if (topicType === "OFFER" && offer) body.offer = offer;

  try {
    const res = await fetch(
      `${MYBUSINESS_V4}/${locationName}/localPosts`,
      {
        method: "POST",
        headers: jsonHeaders(accessToken),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    const json = await res.json();
    if (!res.ok) {
      const errMsg = json?.error?.message ?? "unknown";
      const retryable =
        res.status >= 500 ||
        res.status === 429 ||
        /rateLimitExceeded|backendError/i.test(String(errMsg));
      return {
        ok: false,
        error: `gbp.publishPost failed (${res.status}): ${errMsg}`,
        retryable,
      };
    }
    return {
      ok: true,
      post_name: json.name as string,
      post_url: json.searchUrl as string | undefined,
      state: (json.state as string) ?? "LIVE",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `gbp.publishPost exception: ${msg}`,
      retryable: /timeout|ENOTFOUND|ECONNRESET|5\d\d/i.test(msg),
    };
  }
}

// -----------------------------------------------------------------------------
// Reviews (for future inbox integration)
// -----------------------------------------------------------------------------

export interface GBPReview {
  name: string; // "accounts/{a}/locations/{l}/reviews/{r}"
  reviewId?: string;
  reviewer?: { profilePhotoUrl?: string; displayName?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime: string };
}

export interface ListGBPReviewsParams {
  accessToken: string;
  locationName: string; // "accounts/{a}/locations/{l}"
  pageSize?: number;
  pageToken?: string;
}

export async function listGBPReviews(
  params: ListGBPReviewsParams,
): Promise<{ reviews: GBPReview[]; nextPageToken?: string; averageRating?: number; totalReviewCount?: number }> {
  const { accessToken, locationName, pageSize = 50, pageToken } = params;
  const url = new URL(`${MYBUSINESS_V4}/${locationName}/reviews`);
  url.searchParams.set("pageSize", String(Math.min(pageSize, 50)));
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: jsonHeaders(accessToken),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `gbp.listReviews failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
    );
  }
  return {
    reviews: (json.reviews ?? []) as GBPReview[],
    nextPageToken: json.nextPageToken,
    averageRating: json.averageRating,
    totalReviewCount: json.totalReviewCount,
  };
}

export interface ReplyGBPReviewParams {
  accessToken: string;
  reviewName: string; // "accounts/{a}/locations/{l}/reviews/{r}"
  comment: string;
}

/**
 * PUT the /reply subresource with the manager's response.
 */
export async function replyGBPReview(
  params: ReplyGBPReviewParams,
): Promise<{ ok: true; comment: string; updateTime: string } | { ok: false; error: string; retryable: boolean }> {
  const { accessToken, reviewName, comment } = params;
  try {
    const res = await fetch(`${MYBUSINESS_V4}/${reviewName}/reply`, {
      method: "PUT",
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ comment }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: `gbp.replyReview failed (${res.status}): ${json?.error?.message ?? "unknown"}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    }
    return { ok: true, comment: json.comment, updateTime: json.updateTime };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `gbp.replyReview exception: ${msg}`,
      retryable: /timeout|ENOTFOUND|ECONNRESET|5\d\d/i.test(msg),
    };
  }
}
