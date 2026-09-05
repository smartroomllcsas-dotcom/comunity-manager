/**
 * OS Goal Predicates — Sprint 1
 *
 * Each predicate receives a PredicateContext (synthetic in Sprint 1, real CM
 * table queries in Sprint 2) and returns { ok, evidence }.
 *
 * Sprint 2 TODO: replace buildContext() stub in sentinel.ts with real queries
 * against cm_channels, cm_conversations, cm_agent_runs.
 */

export interface PredicateContext {
  /** How many channels are currently live */
  channelsLiveCount: number;
  /** Total channels registered for the org */
  channelsTotalCount: number;
  /** P50 response time in seconds across conversations */
  responseTimeP50Sec: number;
  /** Max response time in seconds (worst case in window) */
  responseTimeMaxSec: number;
  /** Total AI agent cost today in USD */
  costTodayUsd: number;
  /** Leads that have been unassigned for more than N minutes */
  leadsUnassignedOverMinutes: number;
  /** Meta API hits in the last rolling hour */
  metaHitsLastHour: number;
  /** Average trust score across all agents (0–1) */
  avgTrustScore: number;
}

export interface PredicateResult {
  ok: boolean;
  evidence: unknown;
}

export type Predicate = (ctx: PredicateContext) => PredicateResult;

// ─── Thresholds (constants make it easy to tune) ────────────────────────────

/** Minimum fraction of channels that must be live */
const UPTIME_MIN_RATIO = 0.9;

/** SLA: P50 response must be under 5 min, max under 15 min */
const SLA_P50_MAX_SEC = 300;
const SLA_MAX_MAX_SEC = 900;

/** Daily AI cost budget in USD */
const BUDGET_DAILY_MAX_USD = 10;

/** Leads unassigned for more than this many minutes triggers breach */
const LEADS_UNASSIGNED_MAX_MINUTES = 30;

/** Meta API hourly hit rate limit (conservative) */
const META_RATE_LIMIT_MAX_PER_HOUR = 180;

/** Minimum acceptable average trust score */
const TRUST_AVG_MIN = 0.75;

// ─── Predicate implementations ───────────────────────────────────────────────

/**
 * uptime_channels — at least 90 % of channels must be live.
 */
export const uptime_channels: Predicate = (ctx) => {
  const ratio =
    ctx.channelsTotalCount === 0
      ? 1
      : ctx.channelsLiveCount / ctx.channelsTotalCount;
  const ok = ratio >= UPTIME_MIN_RATIO;
  return {
    ok,
    evidence: {
      live: ctx.channelsLiveCount,
      total: ctx.channelsTotalCount,
      ratio: Math.round(ratio * 100) / 100,
      threshold: UPTIME_MIN_RATIO,
    },
  };
};

/**
 * sla_response — P50 response < 5 min AND max response < 15 min.
 */
export const sla_response: Predicate = (ctx) => {
  const p50ok = ctx.responseTimeP50Sec < SLA_P50_MAX_SEC;
  const maxok = ctx.responseTimeMaxSec < SLA_MAX_MAX_SEC;
  return {
    ok: p50ok && maxok,
    evidence: {
      p50Sec: ctx.responseTimeP50Sec,
      maxSec: ctx.responseTimeMaxSec,
      p50Threshold: SLA_P50_MAX_SEC,
      maxThreshold: SLA_MAX_MAX_SEC,
      p50ok,
      maxok,
    },
  };
};

/**
 * budget_daily — total AI cost today must not exceed daily budget.
 */
export const budget_daily: Predicate = (ctx) => {
  const ok = ctx.costTodayUsd <= BUDGET_DAILY_MAX_USD;
  return {
    ok,
    evidence: {
      costTodayUsd: ctx.costTodayUsd,
      budgetUsd: BUDGET_DAILY_MAX_USD,
      overageUsd: ok ? 0 : Math.round((ctx.costTodayUsd - BUDGET_DAILY_MAX_USD) * 100) / 100,
    },
  };
};

/**
 * leads_unassigned — no lead should sit unassigned for more than 30 minutes.
 */
export const leads_unassigned: Predicate = (ctx) => {
  const ok = ctx.leadsUnassignedOverMinutes === 0;
  return {
    ok,
    evidence: {
      leadsUnassignedOverMinutes: ctx.leadsUnassignedOverMinutes,
      threshold: LEADS_UNASSIGNED_MAX_MINUTES,
    },
  };
};

/**
 * rate_limit_meta — Meta API hits last hour must stay under safe threshold.
 */
export const rate_limit_meta: Predicate = (ctx) => {
  const ok = ctx.metaHitsLastHour < META_RATE_LIMIT_MAX_PER_HOUR;
  return {
    ok,
    evidence: {
      hitsLastHour: ctx.metaHitsLastHour,
      limit: META_RATE_LIMIT_MAX_PER_HOUR,
      headroom: META_RATE_LIMIT_MAX_PER_HOUR - ctx.metaHitsLastHour,
    },
  };
};

/**
 * trust_avg — average agent trust score must be >= 0.75.
 */
export const trust_avg: Predicate = (ctx) => {
  const ok = ctx.avgTrustScore >= TRUST_AVG_MIN;
  return {
    ok,
    evidence: {
      avgTrustScore: ctx.avgTrustScore,
      threshold: TRUST_AVG_MIN,
    },
  };
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const predicates: Record<string, Predicate> = {
  uptime_channels,
  sla_response,
  budget_daily,
  leads_unassigned,
  rate_limit_meta,
  trust_avg,
};
