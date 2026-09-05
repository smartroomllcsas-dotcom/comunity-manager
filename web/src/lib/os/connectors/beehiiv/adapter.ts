/**
 * Beehiiv connector — Newsletter / email subscribers.
 *
 * Global-env pattern (like Stripe / no per-brand config): reads
 * BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID from process.env.
 *
 * Ported from FounderOS-DEMO/lib/connectors/beehiiv.ts.
 * Includes 5-min TTL cache on helper calls and graceful degrade
 * (never throws — returns empty on error so the UI can fall back).
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

const BEEHIIV_API = 'https://api.beehiiv.com/v2';
const TTL_MS = 5 * 60_000; // 5 minutes
const REQ_TIMEOUT_MS = 6_000;

// ── Types ──────────────────────────────────────────────────────────────────

export interface BeehiivSubscribersResult {
  count: number;
  active: number;
}

export interface BeehiivPost {
  title: string;
  url: string | null;
  sent_at: string | null;
}

// ── Env helpers ────────────────────────────────────────────────────────────

function getCreds(): { apiKey: string; pubId: string } | null {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) return null;
  return { apiKey, pubId };
}

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// ── Parsers (pure, testable) ───────────────────────────────────────────────

function parseSubscribers(raw: unknown): { total: number; active: number } | null {
  const r = (raw ?? {}) as Record<string, any>;
  const stats = r?.data?.stats ?? r?.stats;
  if (!stats || typeof stats !== 'object') return null;
  const active = stats.active_subscriptions;
  const total = stats.total_subscriptions ?? active;
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return null;
  return {
    total,
    active: typeof active === 'number' && Number.isFinite(active) && active >= 0 ? active : total,
  };
}

function parsePosts(raw: unknown): BeehiivPost[] {
  const rows = (raw as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out: BeehiivPost[] = [];
  for (const row of rows) {
    const p = (row ?? {}) as Record<string, any>;
    if (!p.id) continue;
    const ts = p.publish_date ?? p.displayed_date ?? p.created;
    const sent_at =
      typeof ts === 'number'
        ? new Date(ts * 1000).toISOString()
        : ts
          ? new Date(ts).toISOString()
          : null;
    out.push({
      title: String(p.title ?? 'Untitled'),
      url: typeof p.web_url === 'string' ? p.web_url : null,
      sent_at,
    });
  }
  return out;
}

// ── Cache (per-process, TTL-based) ─────────────────────────────────────────

let subsCache: { at: number; data: BeehiivSubscribersResult | null } | null = null;
let postsCache: { at: number; data: BeehiivPost[] } | null = null;
let probeMetaCache: {
  at: number;
  data: { subscriberCount: number; lastPostAt: string | null } | null;
} | null = null;

function fresh<T>(entry: { at: number; data: T } | null): entry is { at: number; data: T } {
  return !!entry && Date.now() - entry.at < TTL_MS;
}

// ── Public helpers ─────────────────────────────────────────────────────────

/**
 * Live subscriber count (total + active), 5-min cached.
 * Returns {count:0, active:0} on any error or missing creds.
 */
export async function beehiivSubscribers(): Promise<BeehiivSubscribersResult> {
  if (fresh(subsCache)) return subsCache.data ?? { count: 0, active: 0 };
  const creds = getCreds();
  if (!creds) {
    subsCache = { at: Date.now(), data: null };
    return { count: 0, active: 0 };
  }
  try {
    const url = `${BEEHIIV_API}/publications/${creds.pubId}?expand[]=stats`;
    const res = await fetch(url, {
      headers: authHeaders(creds.apiKey),
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseSubscribers(await res.json());
    const out: BeehiivSubscribersResult = parsed
      ? { count: parsed.total, active: parsed.active }
      : { count: 0, active: 0 };
    subsCache = { at: Date.now(), data: out };
    return out;
  } catch {
    // Graceful degrade — no throw
    subsCache = { at: Date.now(), data: subsCache?.data ?? null };
    return subsCache.data ?? { count: 0, active: 0 };
  }
}

/**
 * Recent posts (title, url, sent_at), 5-min cached.
 * Returns [] on any error or missing creds.
 */
export async function beehiivRecentPosts(n: number): Promise<BeehiivPost[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(n)));
  if (fresh(postsCache)) return postsCache.data.slice(0, limit);
  const creds = getCreds();
  if (!creds) {
    postsCache = { at: Date.now(), data: [] };
    return [];
  }
  try {
    const url =
      `${BEEHIIV_API}/publications/${creds.pubId}/posts` +
      `?limit=${limit}&order_by=publish_date&direction=desc`;
    const res = await fetch(url, {
      headers: authHeaders(creds.apiKey),
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = parsePosts(await res.json());
    postsCache = { at: Date.now(), data: list };
    return list.slice(0, limit);
  } catch {
    postsCache = { at: Date.now(), data: postsCache?.data ?? [] };
    return postsCache.data.slice(0, limit);
  }
}

// ── Adapter (health probe) ─────────────────────────────────────────────────

async function probeMeta(): Promise<{
  subscriberCount: number;
  lastPostAt: string | null;
} | null> {
  if (fresh(probeMetaCache)) return probeMetaCache.data;
  const creds = getCreds();
  if (!creds) return null;
  try {
    const url = `${BEEHIIV_API}/publications/${creds.pubId}?expand[]=stats`;
    const res = await fetch(url, {
      headers: authHeaders(creds.apiKey),
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseSubscribers(await res.json());
    // Piggyback most recent post for lastPostAt (best-effort, non-fatal).
    let lastPostAt: string | null = null;
    try {
      const posts = await beehiivRecentPosts(1);
      lastPostAt = posts[0]?.sent_at ?? null;
    } catch {
      lastPostAt = null;
    }
    const data = parsed
      ? { subscriberCount: parsed.total, lastPostAt }
      : { subscriberCount: 0, lastPostAt };
    probeMetaCache = { at: Date.now(), data };
    return data;
  } catch {
    probeMetaCache = { at: Date.now(), data: probeMetaCache?.data ?? null };
    return probeMetaCache.data;
  }
}

export const beehiivAdapter: ConnectorAdapter = {
  id: 'beehiiv',
  label: 'Beehiiv (Newsletter)',
  kind: 'apikey',
  provider: 'beehiiv',

  // orgId is accepted for interface parity but ignored — Beehiiv is
  // wired at the platform level via env vars (not per-brand).
  async probe(_orgId: string): Promise<ProbeResult> {
    const creds = getCreds();
    if (!creds) return { status: 'not_configured' };
    const meta = await probeMeta();
    if (!meta) {
      return {
        status: 'error',
        error: 'Beehiiv API unreachable — check BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID.',
      };
    }
    return {
      status: 'live',
      meta: {
        subscriberCount: meta.subscriberCount,
        lastPostAt: meta.lastPostAt,
        note: null,
      },
    };
  },
};
