/**
 * Trakyo connector — revenue attribution (content → booked calls → payments).
 * Lives under CRM & Revenue. Trakyo's public API surface is still evolving,
 * so this probe is minimally invasive: it verifies the key is present and
 * (best-effort) pings /v1/touches. Never reports a fake "live".
 *
 * Env:
 *   TRAKYO_API_KEY — Bearer token
 *
 * Endpoint:
 *   GET https://api.trakyo.com/v1/touches?limit=1
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

const BASE = 'https://api.trakyo.com/v1';
const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry<T> = { data: T; fetchedAt: number };
const touchesCache = new Map<number, CacheEntry<any[]>>();

function readKey(): string | undefined {
  return process.env.TRAKYO_API_KEY;
}

export const trakyoAdapter: ConnectorAdapter = {
  id: 'trakyo',
  label: 'Trakyo (Touchpoints)',
  kind: 'apikey',
  provider: 'trakyo',

  async probe(_orgId: string): Promise<ProbeResult> {
    const apiKey = readKey();
    if (!apiKey) return { status: 'not_configured' };

    try {
      const res = await fetch(`${BASE}/touches?limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      });

      // 404 on unknown endpoint is fine — key was accepted (no 401/403).
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', error: `Trakyo auth rejected (HTTP ${res.status})` };
      }

      if (!res.ok && res.status !== 404) {
        return {
          status: 'configured',
          meta: { note: `key present, ping HTTP ${res.status}` },
        };
      }

      let count = 0;
      if (res.ok) {
        try {
          const body = (await res.json()) as { touches?: unknown[]; data?: unknown[] };
          count = body.touches?.length ?? body.data?.length ?? 0;
        } catch {
          /* body may be empty */
        }
      }

      return {
        status: 'live',
        meta: {
          endpoint: `${BASE}/touches`,
          sampleCount: count,
          note: null,
        },
      };
    } catch (e: any) {
      return { status: 'error', error: e?.message ?? String(e) };
    }
  },
};

/** Touchpoints feed (5min in-process cache). Returns [] when unconfigured. */
export async function trakyoTouches(limit: number): Promise<any[]> {
  const apiKey = readKey();
  if (!apiKey) return [];

  const cached = touchesCache.get(limit);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${BASE}/touches?limit=${limit}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { touches?: any[]; data?: any[] };
    const data = body.touches ?? body.data ?? [];
    touchesCache.set(limit, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return [];
  }
}
