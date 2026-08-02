/**
 * Sprint 24 · LinkedIn API v202506 (versioned REST) integration.
 *
 * LinkedIn moved to date-versioned APIs. We target `202506`.
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 *
 * IMPORTANT quirks:
 *   - All /rest calls require `LinkedIn-Version: 202506` + `X-Restli-Protocol-Version: 2.0.0`.
 *   - Posts API uses `author` URN which is `urn:li:person:{id}` for personal
 *     UGC and `urn:li:organization:{id}` for company pages. Same endpoint.
 *   - Images/videos require a 2-step upload (register upload → PUT binary →
 *     reference URN). We accept ready image/video URNs from the caller.
 *   - Token lifetime: 60 days for member, 60 days for organization pages.
 */

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API_REST = "https://api.linkedin.com/rest";
const API_V2 = "https://api.linkedin.com/v2";
const LINKEDIN_VERSION = "202506";
const FETCH_TIMEOUT_MS = 30_000;

export const LINKEDIN_SCOPES = [
  "openid",
  "profile",
  "email",
  "w_member_social",
  "w_organization_social",
  "r_organization_social",
  "rw_organization_admin",
] as const;

export type LinkedInVisibility = "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------

export function initLinkedInAuth(
  clientId: string,
  redirectUri: string,
  scopes: readonly string[] = LINKEDIN_SCOPES,
  state?: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
  });
  if (state) params.set("state", state);
  return `${AUTH_URL}?${params.toString()}`;
}

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope: string;
  token_type: "Bearer";
  id_token?: string;
}

export async function exchangeLinkedInCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
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
      `linkedin.exchangeCode failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`,
    );
  }
  return json as LinkedInTokenResponse;
}

// -----------------------------------------------------------------------------
// Identity + org discovery
// -----------------------------------------------------------------------------

function restHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

/**
 * Fetch the authenticated member's URN via OIDC /userinfo.
 */
export async function getLinkedInMemberUrn(
  accessToken: string,
): Promise<{ urn: string; name: string; email?: string; picture?: string }> {
  const res = await fetch(`${API_V2}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `linkedin.getMemberUrn failed (${res.status}): ${json.message ?? "unknown"}`,
    );
  }
  return {
    urn: `urn:li:person:${json.sub}`,
    name: json.name,
    email: json.email,
    picture: json.picture,
  };
}

export interface LinkedInOrg {
  urn: string; // urn:li:organization:{id}
  id: string;
  role: string; // e.g. "ADMINISTRATOR"
  state: string; // e.g. "APPROVED"
  name?: string;
}

/**
 * List organizations the authenticated member can post as.
 * Uses organizationAcls to filter APPROVED ADMINISTRATOR roles, then hydrates names.
 */
export async function listLinkedInOrgs(
  accessToken: string,
): Promise<LinkedInOrg[]> {
  const url =
    `${API_REST}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=(elements*(organization~(id,localizedName,vanityName)))`;
  const res = await fetch(url, {
    headers: restHeaders(accessToken),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `linkedin.listOrgs failed (${res.status}): ${json.message ?? "unknown"}`,
    );
  }
  const elements: any[] = json.elements ?? [];
  return elements.map((el) => {
    const orgRef: string = el.organization ?? "";
    const idMatch = /urn:li:organization:(\d+)/.exec(orgRef);
    const id = idMatch?.[1] ?? "";
    const hydrated = el["organization~"] ?? {};
    return {
      urn: orgRef || `urn:li:organization:${id}`,
      id,
      role: el.role ?? "ADMINISTRATOR",
      state: el.state ?? "APPROVED",
      name: hydrated.localizedName ?? hydrated.vanityName ?? undefined,
    };
  });
}

// -----------------------------------------------------------------------------
// Publishing (Posts API, endpoint /rest/posts, versioned)
// -----------------------------------------------------------------------------

export interface PublishLinkedInParams {
  accessToken: string;
  /** URN of author: `urn:li:person:{id}` OR `urn:li:organization:{id}` */
  authorUrn: string;
  text: string;
  visibility?: LinkedInVisibility;
  /** Optional pre-registered image URN (`urn:li:image:...`) */
  imageUrn?: string;
  /** Optional pre-registered video URN (`urn:li:video:...`) */
  videoUrn?: string;
  /** Optional article/link to attach */
  article?: { source: string; title?: string; description?: string };
  altText?: string;
}

export type LinkedInPublishResult =
  | { ok: true; post_urn: string; post_url?: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * Publish a post to LinkedIn via `POST /rest/posts` (versioned Posts API).
 * Works for both Personal UGC and Company pages — only `authorUrn` differs.
 */
export async function publishLinkedInPost(
  params: PublishLinkedInParams,
): Promise<LinkedInPublishResult> {
  const {
    accessToken,
    authorUrn,
    text,
    visibility = "PUBLIC",
    imageUrn,
    videoUrn,
    article,
    altText,
  } = params;

  const payload: Record<string, unknown> = {
    author: authorUrn,
    commentary: text.slice(0, 3000),
    visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    payload.content = {
      media: { id: imageUrn, ...(altText ? { altText } : {}) },
    };
  } else if (videoUrn) {
    payload.content = {
      media: { id: videoUrn, ...(altText ? { altText } : {}) },
    };
  } else if (article) {
    payload.content = {
      article: {
        source: article.source,
        title: article.title,
        description: article.description,
      },
    };
  }

  try {
    const res = await fetch(`${API_REST}/posts`, {
      method: "POST",
      headers: restHeaders(accessToken),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // 201 Created with post URN in `x-restli-id` header.
    if (res.status === 201) {
      const postUrn = res.headers.get("x-restli-id") ?? "";
      const numericId = /urn:li:share:(\d+)|urn:li:ugcPost:(\d+)/.exec(postUrn);
      const short = numericId?.[1] ?? numericId?.[2];
      return {
        ok: true,
        post_urn: postUrn,
        post_url: short
          ? `https://www.linkedin.com/feed/update/${postUrn}`
          : undefined,
      };
    }

    const json = await res.json().catch(() => ({}) as any);
    const retryable = res.status >= 500 || res.status === 429;
    return {
      ok: false,
      error: `linkedin.publishPost failed (${res.status}): ${json.message ?? "unknown"}`,
      retryable,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg,
      retryable: /timeout|ENOTFOUND|ECONNRESET/i.test(msg),
    };
  }
}
