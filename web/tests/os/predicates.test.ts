import { describe, it, expect } from 'vitest';
import {
  uptime_channels,
  sla_response,
  budget_daily,
  leads_unassigned,
  rate_limit_meta,
  trust_avg,
  predicates,
  type PredicateContext,
} from '@/lib/os/goals/predicates';

// ─── Base context (all passing) ───────────────────────────────────────────────

const BASE_CTX: PredicateContext = {
  channelsLiveCount: 7,
  channelsTotalCount: 7,
  responseTimeP50Sec: 180,
  responseTimeMaxSec: 420,
  costTodayUsd: 2.14,
  leadsUnassignedOverMinutes: 0,
  metaHitsLastHour: 43,
  avgTrustScore: 0.82,
};

function ctx(overrides: Partial<PredicateContext>): PredicateContext {
  return { ...BASE_CTX, ...overrides };
}

// ─── uptime_channels ─────────────────────────────────────────────────────────

describe('uptime_channels', () => {
  it('passes when all channels are live', () => {
    const r = uptime_channels(ctx({ channelsLiveCount: 7, channelsTotalCount: 7 }));
    expect(r.ok).toBe(true);
    expect((r.evidence as any).ratio).toBe(1);
  });

  it('passes when ratio is exactly 90%', () => {
    const r = uptime_channels(ctx({ channelsLiveCount: 9, channelsTotalCount: 10 }));
    expect(r.ok).toBe(true);
  });

  it('breaches when fewer than 90% of channels are live', () => {
    const r = uptime_channels(ctx({ channelsLiveCount: 5, channelsTotalCount: 10 }));
    expect(r.ok).toBe(false);
    expect((r.evidence as any).ratio).toBe(0.5);
  });

  it('passes when total is 0 (edge case — no channels configured)', () => {
    const r = uptime_channels(ctx({ channelsLiveCount: 0, channelsTotalCount: 0 }));
    expect(r.ok).toBe(true);
  });
});

// ─── sla_response ─────────────────────────────────────────────────────────────

describe('sla_response', () => {
  it('passes when both P50 and max are within SLA', () => {
    const r = sla_response(ctx({ responseTimeP50Sec: 180, responseTimeMaxSec: 420 }));
    expect(r.ok).toBe(true);
  });

  it('breaches when P50 exceeds 5 minutes', () => {
    const r = sla_response(ctx({ responseTimeP50Sec: 310, responseTimeMaxSec: 420 }));
    expect(r.ok).toBe(false);
    expect((r.evidence as any).p50ok).toBe(false);
  });

  it('breaches when max exceeds 15 minutes', () => {
    const r = sla_response(ctx({ responseTimeP50Sec: 180, responseTimeMaxSec: 950 }));
    expect(r.ok).toBe(false);
    expect((r.evidence as any).maxok).toBe(false);
  });

  it('breaches when both P50 and max exceed thresholds', () => {
    const r = sla_response(ctx({ responseTimeP50Sec: 400, responseTimeMaxSec: 1000 }));
    expect(r.ok).toBe(false);
  });
});

// ─── budget_daily ─────────────────────────────────────────────────────────────

describe('budget_daily', () => {
  it('passes when cost is under daily budget', () => {
    const r = budget_daily(ctx({ costTodayUsd: 2.14 }));
    expect(r.ok).toBe(true);
    expect((r.evidence as any).overageUsd).toBe(0);
  });

  it('passes when cost is exactly at budget', () => {
    const r = budget_daily(ctx({ costTodayUsd: 10 }));
    expect(r.ok).toBe(true);
  });

  it('breaches when cost exceeds budget', () => {
    const r = budget_daily(ctx({ costTodayUsd: 12.5 }));
    expect(r.ok).toBe(false);
    expect((r.evidence as any).overageUsd).toBe(2.5);
  });
});

// ─── leads_unassigned ─────────────────────────────────────────────────────────

describe('leads_unassigned', () => {
  it('passes when no leads are unassigned over threshold', () => {
    const r = leads_unassigned(ctx({ leadsUnassignedOverMinutes: 0 }));
    expect(r.ok).toBe(true);
  });

  it('breaches when at least one lead is unassigned past threshold', () => {
    const r = leads_unassigned(ctx({ leadsUnassignedOverMinutes: 3 }));
    expect(r.ok).toBe(false);
    expect((r.evidence as any).leadsUnassignedOverMinutes).toBe(3);
  });
});

// ─── rate_limit_meta ──────────────────────────────────────────────────────────

describe('rate_limit_meta', () => {
  it('passes when hits are well below limit', () => {
    const r = rate_limit_meta(ctx({ metaHitsLastHour: 43 }));
    expect(r.ok).toBe(true);
    expect((r.evidence as any).headroom).toBe(180 - 43);
  });

  it('breaches when hits reach or exceed limit', () => {
    const r = rate_limit_meta(ctx({ metaHitsLastHour: 180 }));
    expect(r.ok).toBe(false);
  });

  it('breaches when hits exceed limit by a lot', () => {
    const r = rate_limit_meta(ctx({ metaHitsLastHour: 250 }));
    expect(r.ok).toBe(false);
    expect((r.evidence as any).headroom).toBe(180 - 250);
  });
});

// ─── trust_avg ────────────────────────────────────────────────────────────────

describe('trust_avg', () => {
  it('passes when avg trust score meets threshold', () => {
    const r = trust_avg(ctx({ avgTrustScore: 0.82 }));
    expect(r.ok).toBe(true);
  });

  it('passes at exactly the threshold', () => {
    const r = trust_avg(ctx({ avgTrustScore: 0.75 }));
    expect(r.ok).toBe(true);
  });

  it('breaches when avg trust score is below threshold', () => {
    const r = trust_avg(ctx({ avgTrustScore: 0.6 }));
    expect(r.ok).toBe(false);
    expect((r.evidence as any).avgTrustScore).toBe(0.6);
  });
});

// ─── predicates registry ──────────────────────────────────────────────────────

describe('predicates registry', () => {
  it('contains all 6 expected keys', () => {
    const keys = Object.keys(predicates);
    expect(keys).toContain('uptime_channels');
    expect(keys).toContain('sla_response');
    expect(keys).toContain('budget_daily');
    expect(keys).toContain('leads_unassigned');
    expect(keys).toContain('rate_limit_meta');
    expect(keys).toContain('trust_avg');
    expect(keys).toHaveLength(6);
  });

  it('all predicates return ok=true for base (synthetic) context', () => {
    for (const [key, pred] of Object.entries(predicates)) {
      const { ok } = pred(BASE_CTX);
      expect(ok, `predicate ${key} should pass on BASE_CTX`).toBe(true);
    }
  });
});
