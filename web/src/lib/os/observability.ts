import { getSupabaseServiceClient } from './supabase-service';

export interface ObservabilityMetrics {
  agentRuns24h: number;
  agentRunsSuccessRate: number;   // 0..1
  costToday: number;
  costLast7d: number;
  activityLast24h: number;
  cronLastRuns: Array<{ endpoint: string; at: string; ok: boolean }>;
  goalsBreachCount: number;
  connectorsLive: number;
  connectorsError: number;
}

export async function loadMetrics(orgId: string): Promise<ObservabilityMetrics> {
  const sb = getSupabaseServiceClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [runs, todayRuns, weekRuns, activity, goals, connectors, cronActivity] = await Promise.all([
    sb.from('os_agent_runs').select('ok').eq('org_id', orgId).gte('started_at', since24h),
    sb.from('os_agent_runs').select('cost_usd').eq('org_id', orgId).gte('started_at', todayStart),
    sb.from('os_agent_runs').select('cost_usd').eq('org_id', orgId).gte('started_at', since7d),
    sb.from('os_activity').select('id').eq('org_id', orgId).gte('at', since24h),
    sb.from('os_goals').select('id, last_status').eq('org_id', orgId).eq('last_status', 'breach'),
    sb.from('os_connectors').select('status').eq('org_id', orgId),
    sb.from('os_activity')
      .select('kind, at, ok, summary')
      .eq('org_id', orgId)
      .in('kind', ['cron.tick', 'goal_check', 'skill.run'])
      .order('at', { ascending: false })
      .limit(10),
  ]);

  const agentRuns24h = runs.data?.length ?? 0;
  const successful = runs.data?.filter((r: { ok: boolean }) => r.ok).length ?? 0;
  const agentRunsSuccessRate = agentRuns24h > 0 ? successful / agentRuns24h : 1;
  const costToday = (todayRuns.data ?? []).reduce((s: number, r: { cost_usd: string | number | null }) => s + Number(r.cost_usd || 0), 0);
  const costLast7d = (weekRuns.data ?? []).reduce((s: number, r: { cost_usd: string | number | null }) => s + Number(r.cost_usd || 0), 0);
  const activityLast24h = activity.data?.length ?? 0;
  const goalsBreachCount = goals.data?.length ?? 0;
  const connectorsLive = connectors.data?.filter((c: { status: string }) => c.status === 'live').length ?? 0;
  const connectorsError = connectors.data?.filter((c: { status: string }) => c.status === 'error').length ?? 0;
  const cronLastRuns = (cronActivity.data ?? []).map((a: { kind: string; at: string; ok: boolean }) => ({
    endpoint: a.kind,
    at: a.at,
    ok: a.ok,
  }));

  return {
    agentRuns24h,
    agentRunsSuccessRate,
    costToday,
    costLast7d,
    activityLast24h,
    cronLastRuns,
    goalsBreachCount,
    connectorsLive,
    connectorsError,
  };
}
