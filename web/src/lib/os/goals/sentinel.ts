/**
 * OS Cron Sentinel — Sprint 1
 *
 * Runs all goal predicates for an org and persists results via OSRepository.
 * On breach, inserts an activity record so the feed surfaces the issue.
 *
 * Sprint 2 TODO: replace buildContext() with real queries against
 * cm_channels, cm_conversations, cm_agent_runs tables.
 */

import { predicates, type PredicateContext } from './predicates';
import type { OSRepository } from '../repository';

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

// ─── Context builder (Sprint 1 stub — synthetic plausible values) ─────────

/**
 * Sprint 1: returns a synthetic context derived from mockup numbers.
 * Sprint 2 TODO: wire real queries:
 *   - channelsLiveCount  → SELECT COUNT(*) FROM cm_channels WHERE status='live' AND org_id=?
 *   - responseTimeP50Sec → percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time_sec) FROM cm_conversations
 *   - costTodayUsd       → SUM(cost_usd) FROM cm_agent_runs WHERE started_at >= today
 *   - leadsUnassigneOver → COUNT(*) FROM cm_conversations WHERE unassigned AND age > 30m
 *   - metaHitsLastHour   → COUNT(*) FROM cm_meta_api_log WHERE ts >= NOW() - interval '1h'
 *   - avgTrustScore      → AVG(trust_score) FROM os_agents WHERE org_id=?
 */
export async function buildContext(_orgId: string): Promise<PredicateContext> {
  return {
    channelsLiveCount: 7,
    channelsTotalCount: 7,
    responseTimeP50Sec: 180,
    responseTimeMaxSec: 420,
    costTodayUsd: 2.14,
    leadsUnassignedOverMinutes: 0,
    metaHitsLastHour: 43,
    avgTrustScore: 0.82,
  };
}
