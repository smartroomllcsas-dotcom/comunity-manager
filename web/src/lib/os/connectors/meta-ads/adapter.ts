/**
 * Meta Ads connector — Facebook / Instagram Ads Manager metrics.
 *
 * NOT the same as `../meta/adapter.ts` (which handles Facebook Messenger
 * channels). This adapter targets business.facebook.com/adsmanager via the
 * Meta Graph API v21, for campaign metrics used on funnel / analytics pages.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  (required — long-lived user or system-user token)
 *   META_ADS_ACCOUNT_ID    (optional — numeric ad account id, no `act_` prefix.
 *                           If unset, the first account returned by /me/adaccounts is used.)
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expires: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function setCached<T>(key: string, value: T): void {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function normalizeAccountId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const id = String(raw).trim();
  if (!id) return null;
  return id.startsWith('act_') ? id.slice(4) : id;
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number };
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN not set');
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const url = `${GRAPH_BASE}${path}?${qs}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || (body as GraphError).error) {
    const msg = (body as GraphError).error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

async function resolveAccountId(): Promise<string | null> {
  const envId = normalizeAccountId(process.env.META_ADS_ACCOUNT_ID);
  if (envId) return envId;

  const cacheKey = 'meta-ads:first-account';
  const cached = getCached<string | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    const data = await graphGet<{ data?: Array<{ account_id?: string; id?: string }> }>(
      '/me/adaccounts',
      { fields: 'account_id,id', limit: '1' },
    );
    const first = data.data?.[0];
    const id = normalizeAccountId(first?.account_id ?? first?.id);
    setCached(cacheKey, id);
    return id;
  } catch {
    return null;
  }
}

export const metaAdsAdapter: ConnectorAdapter = {
  id: 'meta-ads',
  label: 'Meta Ads (Facebook/IG)',
  // Base schema does not include 'api' — Meta Ads uses a long-lived access token,
  // so 'apikey' is the closest semantic match and keeps typechecks green.
  kind: 'apikey',
  provider: 'meta-ads',

  async probe(_orgId: string): Promise<ProbeResult> {
    const token = process.env.META_ADS_ACCESS_TOKEN;
    if (!token) return { status: 'not_configured' };

    try {
      const cacheKey = 'meta-ads:probe';
      const cached = getCached<ProbeResult>(cacheKey);
      if (cached) return cached;

      const data = await graphGet<{ data?: Array<{ account_id?: string; id?: string }> }>(
        '/me/adaccounts',
        { fields: 'account_id,id,name', limit: '5' },
      );
      const accounts = data.data ?? [];
      const envId = normalizeAccountId(process.env.META_ADS_ACCOUNT_ID);
      const activeAccountId =
        envId ?? normalizeAccountId(accounts[0]?.account_id ?? accounts[0]?.id);

      const result: ProbeResult = {
        status: 'live',
        meta: {
          accountCount: accounts.length,
          activeAccountId,
          scopedByEnv: Boolean(envId),
        },
      };
      setCached(cacheKey, result);
      return result;
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers for funnel / analytics pages
// ─────────────────────────────────────────────────────────────

export interface MetaAdsCampaign {
  id: string;
  name: string;
  status: string;
  spend_cents: number;
  impressions: number;
  clicks: number;
}

interface GraphCampaignRow {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  insights?: {
    data?: Array<{ spend?: string; impressions?: string; clicks?: string }>;
  };
}

function toCents(spend: string | undefined): number {
  if (!spend) return 0;
  const n = Number(spend);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export async function metaAdsCampaigns(): Promise<MetaAdsCampaign[]> {
  const cacheKey = 'meta-ads:campaigns';
  const cached = getCached<MetaAdsCampaign[]>(cacheKey);
  if (cached) return cached;

  const accountId = await resolveAccountId();
  if (!accountId) return [];

  try {
    // Ask for campaign metadata plus a nested insights edge so we get
    // spend/impressions/clicks in one round trip.
    const body = await graphGet<{ data?: GraphCampaignRow[] }>(
      `/act_${accountId}/campaigns`,
      {
        fields:
          'id,name,status,daily_budget,insights.date_preset(this_month){spend,impressions,clicks}',
        limit: '50',
      },
    );

    const rows: MetaAdsCampaign[] = (body.data ?? []).map((c) => {
      const ins = c.insights?.data?.[0] ?? {};
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        spend_cents: toCents(ins.spend),
        impressions: Number(ins.impressions ?? 0) || 0,
        clicks: Number(ins.clicks ?? 0) || 0,
      };
    });
    setCached(cacheKey, rows);
    return rows;
  } catch {
    return [];
  }
}

export interface MetaAdsAccountSummary {
  spend_last_7d: number;
  spend_mtd: number;
  active_campaigns: number;
}

interface InsightsRow {
  spend?: string;
}

export async function metaAdsAccountSummary(): Promise<MetaAdsAccountSummary | null> {
  const cacheKey = 'meta-ads:account-summary';
  const cached = getCached<MetaAdsAccountSummary | null>(cacheKey);
  if (cached !== null) return cached;

  const accountId = await resolveAccountId();
  if (!accountId) {
    setCached(cacheKey, null);
    return null;
  }

  try {
    const [mtd, last7, campaigns] = await Promise.all([
      graphGet<{ data?: InsightsRow[] }>(`/act_${accountId}/insights`, {
        date_preset: 'this_month',
        fields: 'spend',
      }),
      graphGet<{ data?: InsightsRow[] }>(`/act_${accountId}/insights`, {
        date_preset: 'last_7d',
        fields: 'spend',
      }),
      graphGet<{ data?: Array<{ id: string; status: string }> }>(
        `/act_${accountId}/campaigns`,
        { fields: 'id,status', limit: '200' },
      ),
    ]);

    const spend_mtd = toCents(mtd.data?.[0]?.spend);
    const spend_last_7d = toCents(last7.data?.[0]?.spend);
    const active_campaigns = (campaigns.data ?? []).filter(
      (c) => c.status === 'ACTIVE',
    ).length;

    const summary: MetaAdsAccountSummary = {
      spend_last_7d,
      spend_mtd,
      active_campaigns,
    };
    setCached(cacheKey, summary);
    return summary;
  } catch {
    return null;
  }
}
