import { describe, it, expect } from 'vitest';
import { AgentSchema } from '../../src/lib/os/schemas/agent';
import { GoalSchema } from '../../src/lib/os/schemas/goal';
import { SkillSchema } from '../../src/lib/os/schemas/skill';
import { WorkflowSchema } from '../../src/lib/os/schemas/workflow';
import { AgentRunSchema } from '../../src/lib/os/schemas/agent-run';
import { ConnectorSchema } from '../../src/lib/os/schemas/connector';
import { ActivitySchema } from '../../src/lib/os/schemas/activity';

const ORG = '00000000-0000-4000-a000-000000000001';
const TS = '2026-08-15T00:00:00Z';

// ─── AgentSchema ─────────────────────────────────────────────────────────────

describe('AgentSchema', () => {
  const base = {
    id: 'a1', orgId: ORG, departmentId: 'support', name: 'Auto-responder',
    status: 'active', tier: 'worker', createdAt: TS, updatedAt: TS,
  };

  it('parses a valid agent with defaults', () => {
    const parsed = AgentSchema.parse(base);
    expect(parsed.trustScore).toBe(0.5);
    expect(parsed.tools).toEqual([]);
    expect(parsed.constitution).toEqual({});
    expect(parsed.trustLedger).toEqual([]);
    expect(parsed.role).toBe('');
    expect(parsed.instance).toBe('builtin');
  });

  it('preserves explicit trustScore', () => {
    const parsed = AgentSchema.parse({ ...base, trustScore: 0.8 });
    expect(parsed.trustScore).toBe(0.8);
  });

  it('rejects invalid status', () => {
    expect(() => AgentSchema.parse({ ...base, status: 'BOGUS' })).toThrow();
  });

  it('rejects invalid tier', () => {
    expect(() => AgentSchema.parse({ ...base, tier: 'god' })).toThrow();
  });

  it('rejects trustScore > 1', () => {
    expect(() => AgentSchema.parse({ ...base, trustScore: 1.5 })).toThrow();
  });

  it('rejects invalid orgId UUID', () => {
    expect(() => AgentSchema.parse({ ...base, orgId: 'not-a-uuid' })).toThrow();
  });
});

// ─── GoalSchema ──────────────────────────────────────────────────────────────

describe('GoalSchema', () => {
  const base = {
    id: 'g1', orgId: ORG, title: 'Response < 30min', cadence: '*/15 * * * *', createdAt: TS,
  };

  it('parses valid goal with nullable defaults', () => {
    const parsed = GoalSchema.parse(base);
    expect(parsed.ownerAgentId).toBeUndefined();
    expect(parsed.lastStatus).toBeUndefined();
    expect(parsed.spec).toEqual({});
  });

  it('parses goal with lastStatus', () => {
    const parsed = GoalSchema.parse({ ...base, lastStatus: 'ok', lastCheckedAt: TS });
    expect(parsed.lastStatus).toBe('ok');
  });

  it('rejects invalid lastStatus', () => {
    expect(() => GoalSchema.parse({ ...base, lastStatus: 'pending' })).toThrow();
  });
});

// ─── SkillSchema ─────────────────────────────────────────────────────────────

describe('SkillSchema', () => {
  const base = {
    id: 's1', orgId: ORG, name: 'Inbox triage', category: 'support',
  };

  it('parses skill with defaults', () => {
    const parsed = SkillSchema.parse(base);
    expect(parsed.status).toBe('planned');
    expect(parsed.tools).toEqual([]);
    expect(parsed.ord).toBe(0);
    expect(parsed.markdown).toBe('');
  });

  it('rejects invalid status', () => {
    expect(() => SkillSchema.parse({ ...base, status: 'deprecated' })).toThrow();
  });
});

// ─── WorkflowSchema ──────────────────────────────────────────────────────────

describe('WorkflowSchema', () => {
  const base = {
    id: 'w1', orgId: ORG, name: 'Onboarding', createdAt: TS,
  };

  it('parses workflow with defaults', () => {
    const parsed = WorkflowSchema.parse(base);
    expect(parsed.subtitle).toBe('');
    expect(parsed.revenueUsd).toBe(0);
    expect(parsed.steps).toEqual([]);
  });
});

// ─── AgentRunSchema ───────────────────────────────────────────────────────────

describe('AgentRunSchema', () => {
  const base = {
    id: 'r1', orgId: ORG, agentId: 'a1', startedAt: TS,
  };

  it('parses run with optional nulls', () => {
    const parsed = AgentRunSchema.parse(base);
    expect(parsed.ok).toBeUndefined();
    expect(parsed.tokensIn).toBeUndefined();
    expect(parsed.costUsd).toBeUndefined();
  });

  it('parses completed run', () => {
    const parsed = AgentRunSchema.parse({
      ...base, finishedAt: TS, ok: true, tokensIn: 100, tokensOut: 200, costUsd: 0.01,
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.costUsd).toBe(0.01);
  });
});

// ─── ConnectorSchema ─────────────────────────────────────────────────────────

describe('ConnectorSchema', () => {
  const base = {
    id: 'meta-fb', orgId: ORG, kind: 'oauth', provider: 'meta', status: 'not_configured',
  };

  it('parses connector with defaults', () => {
    const parsed = ConnectorSchema.parse(base);
    expect(parsed.config).toEqual({});
    expect(parsed.lastCheckAt).toBeUndefined();
  });

  it('rejects invalid kind', () => {
    expect(() => ConnectorSchema.parse({ ...base, kind: 'graphql' })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => ConnectorSchema.parse({ ...base, status: 'unknown' })).toThrow();
  });
});

// ─── ActivitySchema ───────────────────────────────────────────────────────────

describe('ActivitySchema', () => {
  const base = {
    id: 1, orgId: ORG, kind: 'agent.run.complete', at: TS,
  };

  it('parses activity with defaults', () => {
    const parsed = ActivitySchema.parse(base);
    expect(parsed.summary).toBe('');
    expect(parsed.payload).toEqual({});
    expect(parsed.actorId).toBeUndefined();
  });

  it('rejects non-integer id', () => {
    expect(() => ActivitySchema.parse({ ...base, id: 'abc' })).toThrow();
  });
});
