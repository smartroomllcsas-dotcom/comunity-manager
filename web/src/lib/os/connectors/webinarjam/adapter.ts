/**
 * WebinarJam / EverWebinar connector — Launchpad Cohort webinar funnel.
 * Registrants and attendees are inbound leads. The API key is account-wide
 * and travels as a POST form param (not a bearer header). Honest status:
 *   no key         → not_configured
 *   key rejected   → error
 *   key + list ok  → live
 *
 * Env:
 *   WEBINARJAM_API_KEY
 *
 * Endpoints:
 *   POST https://api.webinarjam.com/everwebinar/webinars      → validate
 *   POST https://api.webinarjam.com/everwebinar/registrants   → recent leads
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

const BASE = 'https://api.webinarjam.com/everwebinar';
const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry<T> = { data: T; fetchedAt: number };
const registrantsCache = new Map<string, CacheEntry<any[]>>();

function readKey(): string | undefined {
  return process.env.WEBINARJAM_API_KEY;
}

function form(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

export const webinarjamAdapter: ConnectorAdapter = {
  id: 'webinarjam',
  label: 'WebinarJam (Registrants)',
  kind: 'apikey',
  provider: 'webinarjam',

  async probe(_orgId: string): Promise<ProbeResult> {
    const apiKey = readKey();
    if (!apiKey) return { status: 'not_configured' };

    try {
      const res = await fetch(`${BASE}/webinars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ api_key: apiKey }),
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        return { status: 'error', error: `WebinarJam HTTP ${res.status}` };
      }

      const body = (await res.json()) as { status?: string; webinars?: unknown[] };
      if (body.status && body.status !== 'success') {
        return { status: 'error', error: `WebinarJam API status: ${body.status}` };
      }

      const count = body.webinars?.length ?? 0;
      return {
        status: 'live',
        meta: {
          webinars: count,
          note: count === 0 ? 'no webinars on account' : null,
        },
      };
    } catch (e: any) {
      return { status: 'error', error: e?.message ?? String(e) };
    }
  },
};

/**
 * Registrants (leads) for a webinar schedule (5min cache per key).
 * Returns [] when unconfigured or on error.
 */
export async function webinarjamRegistrants(
  webinarId: string,
  scheduleId: string,
): Promise<any[]> {
  const apiKey = readKey();
  if (!apiKey) return [];

  const cacheKey = `${webinarId}::${scheduleId}`;
  const cached = registrantsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${BASE}/registrants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ api_key: apiKey, webinar_id: webinarId, schedule_id: scheduleId }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { registrants?: any[] };
    const data = body.registrants ?? [];
    registrantsCache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return [];
  }
}
