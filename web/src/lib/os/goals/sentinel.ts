/**
 * OS Cron Sentinel — Sprint 2
 *
 * Runs all goal predicates for an org and persists results via OSRepository.
 * On breach, inserts an activity record so the feed surfaces the issue.
 *
 * ── Schema discovery (2026-08-14) ────────────────────────────────────────────
 * public.channels
 *   organization_id uuid, status channel_status enum {active,disconnected,pending,error}
 *   → "live" channels = status = 'active'
 *
 * public.conversations
 *   organization_id uuid, assigned_agent_id uuid (nullable = unassigned),
 *   first_response_at timestamptz (nullable), created_at timestamptz, status
 *   → SLA: (first_response_at - created_at) for last-24h convs with a response
 *   → unassigned: status='open' AND assigned_agent_id IS NULL AND created_at < 30min ago
 *
 * public.webhook_events
 *   organization_id uuid, provider text (default 'whatsapp'), created_at timestamptz
 *   → meta hits: provider = 'meta' AND created_at >= 1h ago
 *   NOTE: all current rows use provider='whatsapp'; meta hits will return 0 until
 *   Meta webhook events are also stored here. See TODO below.
 *
 * public.leads
 *   NO organization_id column — global table, no org filter possible.
 *   assigned_to uuid (FK → admin_profiles), status text default 'new'
 *   → TODO: leads_unassigned uses conversations instead (see below)
 *
 * public.os_agent_runs  (os schema, Sprint 1 tables)
 *   org_id uuid, cost_usd numeric, started_at timestamptz
 *
 * public.os_agents  (os schema)
 *   org_id uuid, trust_score numeric (default 0.5)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { predicates, type PredicateContext } from './predicates';
import type { OSRepository } from '../repository';
import { getSupabaseServiceClient } from '../supabase-service';

export type { PredicateContext };

// ─── Sentinel runner ─────────────────────────────────────────────────────────

export async function runSentinel(
  repo: OSRepository,
  orgId: string,
  ctx: PredicateContext,
) {
  const goals = await repo.goals.all(orgId);
  const results: Array<
    | { goalId: string; skipped: true; reason: string }
    | { goalId: string; ok: boolean; evidence: unknown }
  > = [];

  for (const g of goals) {
    const predKey = (g.spec as Record<string, unknown>)?.predicateKey as string | undefined;
    const pred = predKey ? predicates[predKey] : undefined;

    if (!pred) {
      results.push({ goalId: g.id, skipped: true, reason: 'no predicate' });
      continue;
    }

    const { ok, evidence } = pred(ctx);
    await repo.goals.markVerified(orgId, g.id, new Date(), ok, evidence);

    if (!ok) {
      await repo.activity.insert(orgId, {
        kind: 'goal_check',
        actorId: null,
        summary: `Goal breach: ${g.title}`,
        payload: { goalId: g.id, evidence },
        ok: false,
      });
    }

    results.push({ goalId: g.id, ok, evidence });
  }

  return results;
}

// ─── Context builder (Sprint 2 — real Supabase queries) ──────────────────────

/**
 * Builds a PredicateContext from live CM tables.
 * Uses the service-role client to bypass RLS (cron-only — never call from
 * client-facing code).
 *
 * Fallback strategy: any query error returns a safe zero/null value so the
 * sentinel never crashes; breached predicates on stale/missing data are
 * acceptable false-negatives during DB outage.
 */
export async function buildContext(orgId: string): Promise<PredicateContext> {
  const sb = getSupabaseServiceClient();

  // ── 1. Channels uptime ────────────────────────────────────────────────────
  // Table: public.channels  (organization_id, status: 'active'|'disconnected'|'pending'|'error')
  const { data: channels } = await sb
    .from('channels')
    .select('status')
    .eq('organization_id', orgId);

  const channelsTotalCount = channels?.length ?? 0;
  const channelsLiveCount =
    channels?.filter((c) => c.status === 'active').length ?? 0;

  // ── 2. SLA response times (last 24 h) ────────────────────────────────────
  // Table: public.conversations  (organization_id, created_at, first_response_at)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: convs } = await sb
    .from('conversations')
    .select('created_at, first_response_at')
    .eq('organization_id', orgId)
    .gte('created_at', since24h)
    .not('first_response_at', 'is', null);

  const responseTimes = (convs ?? [])
    .map(
      (c) =>
        (new Date(c.first_response_at as string).getTime() -
          new Date(c.created_at as string).getTime()) /
        1000,
    )
    .filter((t) => t >= 0)
    .sort((a, b) => a - b);

  const responseTimeP50Sec = responseTimes.length
    ? responseTimes[Math.floor(responseTimes.length / 2)]
    : 0;
  const responseTimeMaxSec = responseTimes.length
    ? responseTimes[responseTimes.length - 1]
    : 0;

  // ── 3. AI cost today ─────────────────────────────────────────────────────
  // Table: public.os_agent_runs  (org_id, cost_usd, started_at)
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { data: runs } = await sb
    .from('os_agent_runs')
    .select('cost_usd')
    .eq('org_id', orgId)
    .gte('started_at', dayStart);

  const costTodayUsd = (runs ?? []).reduce(
    (sum, r) => sum + (Number(r.cost_usd) || 0),
    0,
  );

  // ── 4. Unassigned open conversations > 30 min ────────────────────────────
  // Table: public.conversations  (organization_id, assigned_agent_id, status, created_at)
  // NOTE: public.leads has no organization_id column so we cannot filter by org.
  //       Using open conversations without an assigned agent as the proxy instead.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: unassigned } = await sb
    .from('conversations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .is('assigned_agent_id', null)
    .lt('created_at', thirtyMinAgo);

  const leadsUnassignedOverMinutes = unassigned?.length ?? 0;

  // ── 5. Meta webhook hits last hour ───────────────────────────────────────
  // Table: public.webhook_events  (organization_id, provider, created_at)
  // Current data: provider default is 'whatsapp'; 'meta' hits = 0 until Meta
  // webhook events are also routed through webhook_events.
  // TODO(sprint-3): confirm Meta webhooks land in this table with provider='meta'
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: metaHits } = await sb
    .from('webhook_events')
    .select('id')
    .eq('organization_id', orgId)
    .eq('provider', 'meta')
    .gte('created_at', hourAgo);

  const metaHitsLastHour = metaHits?.length ?? 0;

  // ── 6. Average trust score ────────────────────────────────────────────────
  // Table: public.os_agents  (org_id, trust_score numeric default 0.5)
  const { data: agents } = await sb
    .from('os_agents')
    .select('trust_score')
    .eq('org_id', orgId);

  const avgTrustScore = agents?.length
    ? agents.reduce((sum, a) => sum + Number(a.trust_score), 0) / agents.length
    : 0;

  return {
    channelsLiveCount,
    channelsTotalCount,
    responseTimeP50Sec,
    responseTimeMaxSec,
    costTodayUsd,
    leadsUnassignedOverMinutes,
    metaHitsLastHour,
    avgTrustScore,
  };
}
