/**
 * Sprint 25 · Community Listening - platform fetchers.
 *
 * Wrappers para obtener menciones de cada canal. Cada fetcher:
 *   - Usa AbortSignal.timeout(30_000).
 *   - Retorna [] on error (NO throw) para que el cron siga adelante con los
 *     otros canales.
 *   - Nunca loguea el access_token en claro.
 *
 * Contrato de salida uniforme: `Mention[]`. La deduplicacion se hace en la
 * capa de DB via UNIQUE (platform, source_url, author_handle).
 */

const FETCH_TIMEOUT_MS = 30_000;
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const LINKEDIN_REST = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202506";
const THREADS_API = "https://graph.threads.net/v1.0";
const TIKTOK_API = "https://open.tiktokapis.com/v2";

export interface Mention {
  platform: string;
  source_type:
    | "mention"
    | "comment"
    | "dm"
    | "review"
    | "tag"
    | "share";
  source_url?: string;
  author_handle: string;
  author_followers?: number;
  content: string;
  fetched_at: string; // ISO
}

function logError(scope: string, err: unknown) {
  // Never log tokens - only scope + message
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[listening/${scope}] ${msg}`);
}

async function safeFetch(
  url: string,
  init: RequestInit = {},
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Try to surface Meta/LinkedIn error payloads (safe: no token in body)
      const bodyText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    logError("http", err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Meta (Facebook Page + Instagram Business)
// -----------------------------------------------------------------------------

/**
 * Fetch mentions/comments/DMs from a Meta asset (Page or IG business account).
 *
 * Sources covered:
 *  - /{page-id}/tagged           -> external mentions of the page ("tag")
 *  - /{ig-user}/tags             -> IG posts tagging the account ("tag")
 *  - /{page-id}/conversations    -> DMs since <since> ("dm")
 *  - /{page-id}/posts + /{post-id}/comments -> comments on recent posts
 */
export async function fetchMetaMentions(
  accessToken: string,
  pageOrIgId: string,
  since: Date,
): Promise<Mention[]> {
  if (!accessToken || !pageOrIgId) return [];
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const auth = `access_token=${encodeURIComponent(accessToken)}`;
  const out: Mention[] = [];

  // 1) Page tagged mentions
  const tagged = (await safeFetch(
    `${META_GRAPH}/${pageOrIgId}/tagged?fields=id,message,permalink_url,from,created_time&limit=50&${auth}`,
  )) as { data?: Array<Record<string, unknown>> } | null;
  if (tagged?.data) {
    for (const item of tagged.data) {
      const created =
        typeof item.created_time === "string" ? item.created_time : "";
      if (created && new Date(created).getTime() < since.getTime()) continue;
      const from = (item.from ?? {}) as { name?: string; id?: string };
      out.push({
        platform: "facebook",
        source_type: "tag",
        source_url:
          typeof item.permalink_url === "string"
            ? item.permalink_url
            : undefined,
        author_handle: from.name || from.id || "unknown",
        content:
          typeof item.message === "string"
            ? item.message
            : "(mencion sin texto)",
        fetched_at: new Date().toISOString(),
      });
    }
  }

  // 2) Conversations (DMs) since <since>
  const convos = (await safeFetch(
    `${META_GRAPH}/${pageOrIgId}/conversations?fields=id,participants,updated_time,messages.limit(5){message,from,created_time}&limit=25&${auth}`,
  )) as {
    data?: Array<{
      id?: string;
      participants?: { data?: Array<{ name?: string; id?: string }> };
      messages?: {
        data?: Array<{
          message?: string;
          from?: { name?: string; id?: string };
          created_time?: string;
        }>;
      };
    }>;
  } | null;
  if (convos?.data) {
    for (const convo of convos.data) {
      const msgs = convo.messages?.data ?? [];
      for (const m of msgs) {
        if (!m.created_time || !m.message) continue;
        if (new Date(m.created_time).getTime() < sinceUnix * 1000) continue;
        const from = m.from ?? {};
        out.push({
          platform: "facebook",
          source_type: "dm",
          source_url: convo.id ? `fb-convo://${convo.id}` : undefined,
          author_handle: from.name || from.id || "unknown",
          content: m.message,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  }

  // 3) Comments on recent posts
  const posts = (await safeFetch(
    `${META_GRAPH}/${pageOrIgId}/posts?fields=id,permalink_url&limit=10&${auth}`,
  )) as { data?: Array<{ id?: string; permalink_url?: string }> } | null;
  if (posts?.data) {
    for (const p of posts.data) {
      if (!p.id) continue;
      const comments = (await safeFetch(
        `${META_GRAPH}/${p.id}/comments?fields=id,message,from,created_time,permalink_url&filter=stream&limit=25&${auth}`,
      )) as {
        data?: Array<{
          id?: string;
          message?: string;
          from?: { name?: string; id?: string };
          created_time?: string;
          permalink_url?: string;
        }>;
      } | null;
      for (const c of comments?.data ?? []) {
        if (!c.created_time || !c.message) continue;
        if (new Date(c.created_time).getTime() < since.getTime()) continue;
        const from = c.from ?? {};
        out.push({
          platform: "facebook",
          source_type: "comment",
          source_url: c.permalink_url || p.permalink_url,
          author_handle: from.name || from.id || "unknown",
          content: c.message,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  }

  return out;
}

// -----------------------------------------------------------------------------
// TikTok
// -----------------------------------------------------------------------------

/**
 * TikTok Research API requiere aprobacion academic/enterprise que la mayoria
 * de clientes no tienen. La Content Posting API (que ya usamos para publish)
 * NO expone menciones o comentarios de terceros.
 *
 * Estrategia 2026:
 *  - Si el user tiene Research API, intentamos /research/video/comment/list/.
 *  - Si no, retornamos [] y logueamos (stub). El CM va a tener que usar
 *    Apify/Scrapling en un futuro sprint para este canal.
 *
 * FIXME (sprint 26+): integrar apify tiktok-scraper como fallback cuando el
 * cliente no tenga Research API.
 */
export async function fetchTikTokMentions(
  accessToken: string,
  userId: string,
  since: Date,
): Promise<Mention[]> {
  if (!accessToken || !userId) return [];
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const out: Mention[] = [];

  // Attempt: comments on own videos (available via v2/video/comment/list/ for
  // OWN videos in some tiers). If not authorized -> empty.
  const videos = (await safeFetch(
    `${TIKTOK_API}/video/list/?fields=id,title,share_url,create_time&max_count=20`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
  )) as {
    data?: {
      videos?: Array<{
        id?: string;
        share_url?: string;
        create_time?: number;
      }>;
    };
  } | null;

  const vids = videos?.data?.videos ?? [];
  for (const v of vids) {
    if (!v.id) continue;
    const comments = (await safeFetch(
      `${TIKTOK_API}/video/comment/list/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ video_id: v.id, max_count: 50 }),
      },
    )) as {
      data?: {
        comments?: Array<{
          text?: string;
          user?: { display_name?: string; unique_id?: string };
          create_time?: number;
        }>;
      };
    } | null;
    for (const c of comments?.data?.comments ?? []) {
      if (!c.text) continue;
      if (c.create_time && c.create_time < sinceUnix) continue;
      out.push({
        platform: "tiktok",
        source_type: "comment",
        source_url: v.share_url,
        author_handle:
          c.user?.unique_id || c.user?.display_name || "unknown",
        content: c.text,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  if (vids.length === 0) {
    logError(
      "tiktok",
      "no videos returned (Research API tier likely required for full listening) - FIXME apify fallback",
    );
  }
  return out;
}

// -----------------------------------------------------------------------------
// LinkedIn (organization or member)
// -----------------------------------------------------------------------------

/**
 * memberOrOrgUrn: full URN, e.g. "urn:li:organization:12345" or "urn:li:person:abc".
 * Reads comments on recent posts. Native "mentions" endpoint no longer exists
 * for third-party apps in v202506 -> comments are the primary listening
 * surface.
 */
export async function fetchLinkedInMentions(
  accessToken: string,
  memberOrOrgUrn: string,
  since: Date,
): Promise<Mention[]> {
  if (!accessToken || !memberOrOrgUrn) return [];
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const out: Mention[] = [];

  const authorParam = encodeURIComponent(memberOrOrgUrn);
  const posts = (await safeFetch(
    `${LINKEDIN_REST}/posts?q=author&author=${authorParam}&count=10`,
    { headers },
  )) as {
    elements?: Array<{
      id?: string;
      publishedAt?: number;
      permalink?: string;
    }>;
  } | null;

  for (const p of posts?.elements ?? []) {
    if (!p.id) continue;
    const postUrn = encodeURIComponent(p.id);
    const comments = (await safeFetch(
      `${LINKEDIN_REST}/socialActions/${postUrn}/comments?count=50`,
      { headers },
    )) as {
      elements?: Array<{
        message?: { text?: string };
        actor?: string;
        created?: { time?: number };
      }>;
    } | null;

    for (const c of comments?.elements ?? []) {
      const text = c.message?.text;
      const created = c.created?.time ?? 0;
      if (!text || created < since.getTime()) continue;
      out.push({
        platform: "linkedin",
        source_type: "comment",
        source_url: p.permalink,
        author_handle: c.actor || "unknown",
        content: text,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  return out;
}

// -----------------------------------------------------------------------------
// Threads
// -----------------------------------------------------------------------------

/**
 * Threads Reply Management API v1.0 supports /{user}/mentions and
 * /{user}/replies. We use both. `userId` is the numeric Threads user id
 * captured at OAuth.
 */
export async function fetchThreadsMentions(
  accessToken: string,
  userId: string,
  since: Date,
): Promise<Mention[]> {
  if (!accessToken || !userId) return [];
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const auth = `access_token=${encodeURIComponent(accessToken)}`;
  const fields =
    "id,text,username,permalink,timestamp,media_type";
  const out: Mention[] = [];

  const mentions = (await safeFetch(
    `${THREADS_API}/${userId}/mentions?fields=${fields}&since=${sinceUnix}&limit=50&${auth}`,
  )) as {
    data?: Array<{
      id?: string;
      text?: string;
      username?: string;
      permalink?: string;
      timestamp?: string;
    }>;
  } | null;
  for (const m of mentions?.data ?? []) {
    if (!m.text) continue;
    out.push({
      platform: "threads",
      source_type: "mention",
      source_url: m.permalink,
      author_handle: m.username || "unknown",
      content: m.text,
      fetched_at: new Date().toISOString(),
    });
  }

  const replies = (await safeFetch(
    `${THREADS_API}/${userId}/replies?fields=${fields}&since=${sinceUnix}&limit=50&${auth}`,
  )) as {
    data?: Array<{
      id?: string;
      text?: string;
      username?: string;
      permalink?: string;
    }>;
  } | null;
  for (const r of replies?.data ?? []) {
    if (!r.text) continue;
    out.push({
      platform: "threads",
      source_type: "comment",
      source_url: r.permalink,
      author_handle: r.username || "unknown",
      content: r.text,
      fetched_at: new Date().toISOString(),
    });
  }

  return out;
}
