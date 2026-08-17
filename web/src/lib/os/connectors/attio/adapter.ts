/**
 * Attio (CRM) connector — global env-based wire.
 *
 * Ported from FounderOS-DEMO/lib/connectors/attio.ts. Unlike per-org
 * connectors (stripe, notion) whose secrets live in os_connectors.config,
 * Attio here is a global integration keyed by `ATTIO_API_KEY` in process.env.
 * This mirrors the shape Alex ran locally: one workspace, one key, shared
 * across every org that queries funnel/brain data.
 *
 * Auth: `Authorization: Bearer <ATTIO_API_KEY>` against `https://api.attio.com/v2/`.
 * Attio tokens are usually record-read scoped, so we probe with the `/self`
 * endpoint (workspace metadata) which every valid token can reach.
 *
 * The helpers `attioPeople` / `attioCompanies` / `attioJourneys` exist for
 * downstream funnel & brain modules. They query `/v2/objects/<slug>/records/query`
 * (POST) because Attio's list endpoints often 403 with scoped tokens. Results
 * are cached for 5 minutes in-process to keep dashboard renders cheap.
 */

import type { ConnectorAdapter, ProbeResult } from '../base';

const ATTIO_BASE = 'https://api.attio.com/v2';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 4000;

// ─── credential resolution ─────────────────────────────────────────────────

function resolveAttioKey(): string | null {
  const envKey = process.env.ATTIO_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();
  // ~/.config/mcp.json fallback — read lazily and defensively so a missing
  // file (typical in prod) never throws at import time.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('node:os') as typeof import('node:os');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');
    const file = path.join(os.homedir(), '.config', 'mcp.json');
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, { env?: Record<string, string> }>;
    };
    const servers = parsed.mcpServers ?? {};
    for (const server of Object.values(servers)) {
      const v = server.env?.ATTIO_API_KEY;
      if (v && v.trim()) return v.trim();
    }
  } catch {
    // ignore — no mcp.json, no key here
  }
  return null;
}

// ─── in-process cache ──────────────────────────────────────────────────────

type CacheEntry<T> = { value: T; fetchedAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T): void {
  cache.set(key, { value, fetchedAt: Date.now() });
}

// ─── HTTP helper ───────────────────────────────────────────────────────────

async function attioFetch(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  const key = resolveAttioKey();
  if (!key) return { ok: false, status: 0, error: 'ATTIO_API_KEY not configured' };
  try {
    const res = await fetch(`${ATTIO_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as unknown;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── adapter ───────────────────────────────────────────────────────────────

export const attioAdapter: ConnectorAdapter = {
  id: 'attio',
  label: 'Attio (CRM)',
  kind: 'oauth',
  provider: 'attio',

  async probe(_orgId: string): Promise<ProbeResult> {
    const key = resolveAttioKey();
    if (!key) return { status: 'not_configured' };
    const res = await attioFetch('/self', { method: 'GET' });
    if (!res.ok) {
      if (res.status === 401) {
        return { status: 'error', error: 'Invalid Attio API key' };
      }
      return { status: 'error', error: res.error };
    }
    // /self returns { data: { workspace_id, workspace_name, ... } }
    const body = res.data as { data?: { workspace_id?: string; workspace_name?: string } };
    const workspaceId = body.data?.workspace_id ?? null;
    const workspaceName = body.data?.workspace_name ?? null;
    return {
      status: 'live',
      meta: { workspaceId, workspaceName },
    };
  },
};

// ─── helpers (funnel / brain usage) ────────────────────────────────────────

export interface AttioPerson {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

export interface AttioCompany {
  id: string;
  name: string;
  domain: string | null;
}

export interface AttioJourney {
  personId: string;
  stage: string;
  updatedAt: string | null;
}

type AttioCell = { value?: unknown; status?: { title?: unknown } } & Record<string, unknown>;
type AttioRecord = {
  id?: { record_id?: unknown };
  values?: Record<string, unknown>;
  updated_at?: unknown;
};

function firstCell(values: Record<string, unknown> | undefined, slug: string): AttioCell | undefined {
  if (!values) return undefined;
  const cell = values[slug];
  return Array.isArray(cell) && cell[0] && typeof cell[0] === 'object'
    ? (cell[0] as AttioCell)
    : undefined;
}

function readRecordId(rec: AttioRecord): string | null {
  return typeof rec.id?.record_id === 'string' ? rec.id.record_id : null;
}

async function queryRecords(objectSlug: string, limit: number): Promise<AttioRecord[]> {
  const res = await attioFetch(`/objects/${objectSlug}/records/query`, {
    method: 'POST',
    body: { limit },
  });
  if (!res.ok) return [];
  const body = res.data as { data?: unknown[] };
  return (body.data ?? []).filter(
    (r): r is AttioRecord => !!r && typeof r === 'object',
  );
}

export async function attioPeople(limit: number): Promise<AttioPerson[]> {
  const cacheKey = `people:${limit}`;
  const cached = cacheGet<AttioPerson[]>(cacheKey);
  if (cached) return cached;
  const records = await queryRecords('people', limit);
  const rows: AttioPerson[] = [];
  for (const rec of records) {
    const id = readRecordId(rec);
    if (!id) continue;
    const nameCell = firstCell(rec.values, 'name');
    // Attio `name` cell can be `{ full_name, first_name, last_name }` or plain value.
    const nameVal =
      (nameCell?.full_name as string | undefined) ??
      (typeof nameCell?.value === 'string' ? (nameCell.value as string) : null);
    const emailCell = firstCell(rec.values, 'email_addresses');
    const emailVal =
      (emailCell?.email_address as string | undefined) ??
      (typeof emailCell?.value === 'string' ? (emailCell.value as string) : null);
    const companyCell = firstCell(rec.values, 'company');
    const companyVal =
      (companyCell?.target_object as string | undefined) ??
      (typeof companyCell?.value === 'string' ? (companyCell.value as string) : null);
    rows.push({
      id,
      name: nameVal ?? id,
      email: emailVal ?? null,
      company: companyVal ?? null,
    });
  }
  cacheSet(cacheKey, rows);
  return rows;
}

export async function attioCompanies(limit: number): Promise<AttioCompany[]> {
  const cacheKey = `companies:${limit}`;
  const cached = cacheGet<AttioCompany[]>(cacheKey);
  if (cached) return cached;
  const records = await queryRecords('companies', limit);
  const rows: AttioCompany[] = [];
  for (const rec of records) {
    const id = readRecordId(rec);
    if (!id) continue;
    const nameCell = firstCell(rec.values, 'name');
    const nameVal = typeof nameCell?.value === 'string' ? (nameCell.value as string) : null;
    const domainCell = firstCell(rec.values, 'domains');
    const domainVal =
      (domainCell?.domain as string | undefined) ??
      (typeof domainCell?.value === 'string' ? (domainCell.value as string) : null);
    rows.push({
      id,
      name: nameVal ?? id,
      domain: domainVal ?? null,
    });
  }
  cacheSet(cacheKey, rows);
  return rows;
}

export async function attioJourneys(limit: number): Promise<AttioJourney[]> {
  const cacheKey = `journeys:${limit}`;
  const cached = cacheGet<AttioJourney[]>(cacheKey);
  if (cached) return cached;
  // Attio "journeys" are typically modeled as `deals` records with a `stage`
  // status attribute; we reuse the same query shape as FounderOS-DEMO.
  const records = await queryRecords('deals', limit);
  const rows: AttioJourney[] = [];
  for (const rec of records) {
    const id = readRecordId(rec);
    if (!id) continue;
    const stageCell = firstCell(rec.values, 'stage');
    const stageStatus = (stageCell?.status ?? {}) as Record<string, unknown>;
    const stage =
      typeof stageStatus.title === 'string' && stageStatus.title
        ? (stageStatus.title as string)
        : 'open';
    const updatedAt = typeof rec.updated_at === 'string' ? rec.updated_at : null;
    rows.push({ personId: id, stage, updatedAt });
  }
  cacheSet(cacheKey, rows);
  return rows;
}
