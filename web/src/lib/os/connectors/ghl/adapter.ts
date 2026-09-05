/**
 * GoHighLevel connector — Launchpad Cohort sub-account: pipelines,
 * opportunities, contacts. Auth is a Private Integration Token (Settings →
 * Private Integrations, read scopes) plus a location id. Never reports a
 * fake "live".
 *
 * Env:
 *   GHL_API_KEY       — Private Integration token (Bearer)
 *   GHL_LOCATION_ID   — location/sub-account id (required by v2 API)
 *
 * Endpoints:
 *   GET https://services.leadconnectorhq.com/contacts/?locationId=<id>&limit=1
 *     Headers: Authorization: Bearer <key>, Version: 2021-07-28
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

const BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry<T> = { data: T; fetchedAt: number };
const contactsCache = new Map<number, CacheEntry<any[]>>();

function readCreds(): { apiKey?: string; locationId?: string } {
  return {
    apiKey: process.env.GHL_API_KEY,
    locationId: process.env.GHL_LOCATION_ID,
  };
}

export const ghlAdapter: ConnectorAdapter = {
  id: 'ghl',
  label: 'GoHighLevel (Funnel)',
  kind: 'apikey',
  provider: 'ghl',

  async probe(_orgId: string): Promise<ProbeResult> {
    const { apiKey, locationId } = readCreds();
    if (!apiKey || !locationId) {
      return {
        status: 'not_configured',
        meta: {
          note: 'set GHL_API_KEY + GHL_LOCATION_ID',
        },
      };
    }

    try {
      const url = `${BASE}/contacts/?locationId=${encodeURIComponent(locationId)}&limit=1`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: API_VERSION,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      });

      if (res.status === 401 || res.status === 403) {
        return { status: 'error', error: `GHL auth rejected (HTTP ${res.status})` };
      }

      if (!res.ok) {
        return { status: 'error', error: `GHL HTTP ${res.status}` };
      }

      let total = 0;
      try {
        const body = (await res.json()) as { contacts?: unknown[]; meta?: { total?: number } };
        total = body.meta?.total ?? body.contacts?.length ?? 0;
      } catch {
        /* empty body ok */
      }

      return {
        status: 'live',
        meta: {
          locationId,
          contactsTotal: total,
          note: null,
        },
      };
    } catch (e: any) {
      return { status: 'error', error: e?.message ?? String(e) };
    }
  },
};

/**
 * Recent GHL contacts (5min in-process cache per limit).
 * Returns [] when unconfigured or on error.
 */
export async function ghlContacts(limit: number): Promise<any[]> {
  const { apiKey, locationId } = readCreds();
  if (!apiKey || !locationId) return [];

  const cached = contactsCache.get(limit);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `${BASE}/contacts/?locationId=${encodeURIComponent(locationId)}&limit=${limit}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: API_VERSION,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { contacts?: any[] };
    const data = body.contacts ?? [];
    contactsCache.set(limit, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return [];
  }
}
