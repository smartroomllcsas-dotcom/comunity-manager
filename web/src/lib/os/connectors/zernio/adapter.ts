/**
 * Zernio (Social Posts) connector — ported from FounderOS-DEMO.
 *
 * Reads Zernio/Late published posts (getlate.dev / zernio.com API). Env-based
 * config (like Stripe adapter): `ZERNIO_API_KEY` from process.env, with
 * fallback to `~/.config/social/.env` (KEY=VALUE lines).
 *
 * Optional per-org override: `os_connectors.config.api_key` (unwrapped like
 * Stripe). Falls back to env if absent.
 *
 * Cache: module-level 60s TTL per function (accounts, history, postDays).
 * Never throws — probe() returns `{status: 'error', error: ...}` on failure.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ConnectorAdapter, ProbeResult } from '../base';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { unwrapSecret } from '@/lib/os/crypto';

// ── Config + credentials ────────────────────────────────────────────────────

const SOCIAL_ENV_PATH = path.join(os.homedir(), '.config', 'social', '.env');
const CONFIG_PATH = path.join(os.homedir(), '.config', 'social', 'config.json');

type ZernioConfig = {
  baseUrl?: string;
  v1Url?: string;
  accounts?: Record<string, { handle?: string; followers?: number }>;
};

function readConfig(): ZernioConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as ZernioConfig;
  } catch {
    return {};
  }
}

/** Read KEY from process.env, fallback to `~/.config/social/.env`. */
function readEnvKey(key: string): string | undefined {
  const fromProc = process.env[key];
  if (fromProc && fromProc.trim()) return fromProc.trim();
  try {
    const raw = fs.readFileSync(SOCIAL_ENV_PATH, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      if (k !== key) continue;
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  } catch {
    /* file missing — fine */
  }
  return undefined;
}

/** Zernio API key from env, ~/.config/social/.env, or per-org override. */
export function zernioKey(orgOverride?: string | null): string | undefined {
  if (orgOverride && orgOverride.trim()) return orgOverride.trim();
  return readEnvKey('ZERNIO_API_KEY');
}

// ── Types ───────────────────────────────────────────────────────────────────

export type ZernioPost = {
  platform: string;
  caption: string;
  url: string;
  publishedAt: string | null;
  status: string;
};

export type ZernioPostDay = { date: string; platforms: string[] };

type FollowerMap = Record<string, { handle?: string; followers?: number }>;

// ── Parsers (pure, exported for testing) ────────────────────────────────────

function pickFollowers(account: unknown): number | undefined {
  const a = (account ?? {}) as Record<string, any>;
  const md = (a.metadata ?? {}) as Record<string, any>;
  const pages = Array.isArray(md.availablePages) ? md.availablePages : [];
  const candidates: unknown[] = [
    md?.profileData?.followersCount,
    md?.profileData?.followers,
    md?.followersCount,
    md?.followers,
    ...pages.map((p: any) => p?.fan_count),
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
  }
  return undefined;
}

export function parseLiveAccounts(raw: unknown): FollowerMap {
  const accounts = (raw as { accounts?: unknown })?.accounts;
  if (!Array.isArray(accounts)) return {};
  const out: FollowerMap = {};
  for (const account of accounts) {
    const a = (account ?? {}) as Record<string, any>;
    const platform = typeof a.platform === 'string' ? a.platform : undefined;
    if (!platform) continue;
    const followers = pickFollowers(a);
    if (followers == null) continue;
    const username = typeof a.username === 'string' ? a.username : undefined;
    out[platform] = { handle: username ? `@${username}` : undefined, followers };
  }
  return out;
}

/** Map a `/history` payload to recent published posts. */
export function parseHistory(raw: unknown, limit = 6): ZernioPost[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { posts?: unknown })?.posts)
      ? ((raw as { posts: unknown[] }).posts)
      : null;
  if (!arr) return [];
  return arr.slice(0, limit).map((entry) => {
    const e = (entry ?? {}) as Record<string, any>;
    const postIds = Array.isArray(e.postIds) ? e.postIds : [];
    const primary = postIds.find((p: any) => p?.postUrl) ?? postIds[0] ?? {};
    const platform =
      (typeof primary.platform === 'string' && primary.platform) ||
      (Array.isArray(e.platforms) && typeof e.platforms[0] === 'string' && e.platforms[0]) ||
      'unknown';
    const caption = typeof e.post === 'string' ? e.post : typeof e.content === 'string' ? e.content : '';
    return {
      platform: String(platform),
      caption,
      url: typeof primary.postUrl === 'string' ? primary.postUrl : '',
      publishedAt:
        typeof e.created === 'string' ? e.created : typeof e.scheduleDate === 'string' ? e.scheduleDate : null,
      status: typeof e.status === 'string' ? e.status : 'unknown',
    };
  });
}

/** Map a `/history` payload to one {date, platforms[]} per post. */
export function parsePostDays(raw: unknown): ZernioPostDay[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { posts?: unknown })?.posts)
      ? ((raw as { posts: unknown[] }).posts)
      : null;
  if (!arr) return [];
  const out: ZernioPostDay[] = [];
  for (const entry of arr) {
    const e = (entry ?? {}) as Record<string, any>;
    const stamp =
      typeof e.created === 'string' ? e.created : typeof e.scheduleDate === 'string' ? e.scheduleDate : null;
    const platforms = Array.isArray(e.platforms)
      ? e.platforms.filter((p: unknown): p is string => typeof p === 'string')
      : [];
    if (!stamp || platforms.length === 0) continue;
    out.push({ date: stamp.slice(0, 10), platforms });
  }
  return out;
}

// ── Live fetchers (60s cached) ──────────────────────────────────────────────

const LIVE_TTL_MS = 60_000;

let liveAccountsCache: { at: number; data: FollowerMap } | null = null;
let postDaysCache: { at: number; data: ZernioPostDay[] } | null = null;
let livePostsCache: { at: number; data: ZernioPost[] } | null = null;

/** Live follower counts. 60s cache; 6s timeout; falls back to last-good on error. */
export async function zernioLiveAccounts(): Promise<FollowerMap> {
  const now = Date.now();
  if (liveAccountsCache && now - liveAccountsCache.at < LIVE_TTL_MS) return liveAccountsCache.data;
  const key = zernioKey();
  if (!key) return {};
  const config = readConfig();
  try {
    const res = await fetch(`${config.v1Url ?? 'https://zernio.com/api/v1'}/accounts`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseLiveAccounts(await res.json());
    liveAccountsCache = { at: now, data };
    return data;
  } catch {
    return liveAccountsCache?.data ?? {};
  }
}

/** Recent published posts. 60s cache. */
export async function zernioRecentPosts(limit = 6): Promise<ZernioPost[]> {
  const now = Date.now();
  if (livePostsCache && now - livePostsCache.at < LIVE_TTL_MS) return livePostsCache.data.slice(0, limit);
  const key = zernioKey();
  if (!key) return [];
  const config = readConfig();
  try {
    const res = await fetch(`${config.baseUrl ?? 'https://getlate.dev/api'}/history`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseHistory(await res.json(), 24);
    livePostsCache = { at: now, data };
    return data.slice(0, limit);
  } catch {
    return livePostsCache?.data.slice(0, limit) ?? [];
  }
}

/** Full posting history (date + platforms). 60s cache. */
export async function zernioPostDays(): Promise<ZernioPostDay[]> {
  const now = Date.now();
  if (postDaysCache && now - postDaysCache.at < LIVE_TTL_MS) return postDaysCache.data;
  const key = zernioKey();
  if (!key) return [];
  const config = readConfig();
  try {
    const res = await fetch(`${config.baseUrl ?? 'https://getlate.dev/api'}/history?limit=200`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parsePostDays(await res.json());
    postDaysCache = { at: now, data };
    return data;
  } catch {
    return postDaysCache?.data ?? [];
  }
}

/** Configured social accounts from `~/.config/social/config.json`. */
export function zernioSocialAccounts(): Record<string, { handle?: string; followers?: number }> {
  return readConfig().accounts ?? {};
}

// ── Adapter (mirrors stripe pattern: env-first, per-org override) ───────────

export const zernioAdapter: ConnectorAdapter = {
  id: 'zernio',
  label: 'Zernio (Social Posts)',
  kind: 'apikey',
  provider: 'zernio',

  async probe(orgId: string): Promise<ProbeResult> {
    // Optional per-org override (like stripe: os_connectors.config.api_key).
    let overrideKey: string | null = null;
    try {
      const sb = getSupabaseServiceClient();
      const { data } = await sb
        .from('os_connectors')
        .select('config')
        .eq('org_id', orgId)
        .eq('id', 'zernio')
        .maybeSingle();
      const cfg = (data?.config ?? {}) as { api_key?: string };
      if (cfg.api_key) overrideKey = unwrapSecret(cfg.api_key);
    } catch {
      /* connector row missing is fine — fall back to env */
    }

    const key = zernioKey(overrideKey);
    if (!key) {
      return {
        status: 'not_configured',
        meta: { note: 'ZERNIO_API_KEY not set (env, ~/.config/social/.env, or os_connectors.config.api_key)' },
      };
    }

    const config = readConfig();
    try {
      const res = await fetch(`${config.v1Url ?? 'https://zernio.com/api/v1'}/accounts`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        return { status: 'error', error: `Zernio /v1/accounts HTTP ${res.status}` };
      }
      const raw = await res.json();
      const live = parseLiveAccounts(raw);
      const accountCount = Object.keys(live).length;

      // Try to also grab a lastPostAt via cached history (non-blocking best-effort).
      let lastPostAt: string | null = null;
      try {
        const posts = await zernioRecentPosts(1);
        lastPostAt = posts[0]?.publishedAt ?? null;
      } catch {
        /* best-effort */
      }

      return {
        status: 'live',
        meta: {
          accountCount,
          lastPostAt,
          platforms: Object.keys(live),
        },
      };
    } catch (e: any) {
      return { status: 'error', error: e?.message ?? String(e) };
    }
  },
};
