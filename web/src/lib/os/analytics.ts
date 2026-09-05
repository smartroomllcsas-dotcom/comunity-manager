import { getSupabaseServiceClient } from './supabase-service';

export interface OsAnalytics {
  daysActive: number;
  totalAgentRuns: number;
  totalCostUsd: number;
  costPerMessage: number;      // cost / activity events kind='agent.run.complete'
  successRate: number;         // 0..1
  trustTrend: Array<{ date: string; avgScore: number }>;
  goalsHealthDaily: Array<{ date: string; passCount: number; breachCount: number }>;
  topAgents: Array<{ agentId: string; name: string; runs: number; successRate: number }>;
  cronReliability: Array<{ endpoint: string; runs: number; failures: number }>;
}

export async function loadAnalytics(orgId: string, days = 30): Promise<OsAnalytics> {
  const sb = getSupabaseServiceClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [runs, activity, agents] = await Promise.all([
    sb.from('os_agent_runs').select('agent_id, ok, cost_usd, started_at').eq('org_id', orgId).gte('started_at', since),
    sb.from('os_activity').select('kind, at, ok').eq('org_id', orgId).gte('at', since),
    sb.from('os_agents').select('id, name, trust_score'),
  ]);

  const allRuns = runs.data ?? [];
  const totalAgentRuns = allRuns.length;
  const totalCostUsd = allRuns.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const successRate = totalAgentRuns > 0 ? allRuns.filter(r => r.ok).length / totalAgentRuns : 1;
  const runMessages = (activity.data ?? []).filter(a => a.kind === 'agent.run.complete').length;
  const costPerMessage = runMessages > 0 ? totalCostUsd / runMessages : 0;

  // Bucketize runs per agent
  const byAgent = new Map<string, { runs: number; success: number }>();
  for (const r of allRuns) {
    const g = byAgent.get(r.agent_id) ?? { runs: 0, success: 0 };
    g.runs++;
    if (r.ok) g.success++;
    byAgent.set(r.agent_id, g);
  }
  const nameMap = new Map((agents.data ?? []).map(a => [a.id, a.name]));
  const topAgents = Array.from(byAgent.entries())
    .map(([agentId, g]) => ({
      agentId,
      name: nameMap.get(agentId) ?? agentId,
      runs: g.runs,
      successRate: g.runs > 0 ? g.success / g.runs : 1,
    }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 10);

  const goalChecks = (activity.data ?? []).filter(a => a.kind === 'goal_check');
  const byDay: Record<string, { pass: number; breach: number }> = {};
  for (const g of goalChecks) {
    const day = g.at.slice(0, 10);
    byDay[day] = byDay[day] ?? { pass: 0, breach: 0 };
    if (g.ok) byDay[day].pass++;
    else byDay[day].breach++;
  }
  const goalsHealthDaily = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, x]) => ({ date, passCount: x.pass, breachCount: x.breach }));

  const cronKinds = (activity.data ?? []).filter(a =>
    ['goal_check', 'skill.run', 'broadcast.published'].includes(a.kind)
  );
  const cronByEndpoint: Record<string, { runs: number; failures: number }> = {};
  for (const c of cronKinds) {
    cronByEndpoint[c.kind] = cronByEndpoint[c.kind] ?? { runs: 0, failures: 0 };
    cronByEndpoint[c.kind].runs++;
    if (!c.ok) cronByEndpoint[c.kind].failures++;
  }
  const cronReliability = Object.entries(cronByEndpoint).map(([endpoint, x]) => ({
    endpoint,
    ...x,
  }));

  // Sprint 5: snapshot daily trust trend. Sprint 4: single current point.
  const trustTrend: OsAnalytics['trustTrend'] = [];
  if (agents.data && agents.data.length) {
    const avg =
      agents.data.reduce((s, a) => s + Number(a.trust_score || 0), 0) / agents.data.length;
    trustTrend.push({ date: new Date().toISOString().slice(0, 10), avgScore: avg });
  }

  return {
    daysActive: days,
    totalAgentRuns,
    totalCostUsd,
    costPerMessage,
    successRate,
    trustTrend,
    goalsHealthDaily,
    topAgents,
    cronReliability,
  };
}
