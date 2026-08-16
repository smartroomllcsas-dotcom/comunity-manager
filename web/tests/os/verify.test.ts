import { describe, expect, it } from 'vitest';
import { verify } from '@/lib/os/agents/verify';
import { updateTrust } from '@/lib/os/agents/trust';
import type { Agent } from '@/lib/os/schemas/agent';

// ── verify ──────────────────────────────────────────────────────────────────

describe('verify', () => {
  const spec = {};

  it('fails on null output', () => {
    const result = verify(spec, null);
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toBe('empty output');
  });

  it('fails on blank string output', () => {
    const result = verify(spec, '   ');
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toBe('blank output');
  });

  it('passes on valid string output', () => {
    const result = verify(spec, 'hello world');
    expect(result.pass).toBe(true);
  });

  it('passes on object output', () => {
    const result = verify(spec, { data: 42 });
    expect(result.pass).toBe(true);
  });

  it('fails on undefined output', () => {
    const result = verify(spec, undefined);
    expect(result.pass).toBe(false);
  });
});

// ── updateTrust ──────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  const now = new Date().toISOString();
  return {
    id: 'agent-1',
    orgId: '00000000-0000-0000-0000-000000000001',
    departmentId: 'inbox',
    name: 'Test Agent',
    role: '',
    status: 'active',
    tier: 'worker',
    description: '',
    model: 'sonnet',
    tools: [],
    instance: 'builtin',
    constitution: {},
    trustScore: 0.5,
    trustLedger: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('updateTrust', () => {
  it('first pass sets trustScore to 1.0', () => {
    const agent = makeAgent();
    const updated = updateTrust(agent, 'run-1', 'pass');
    expect(updated.trustScore).toBe(1.0);
    expect(updated.trustLedger).toHaveLength(1);
    expect(updated.trustLedger[0].verdict).toBe('pass');
  });

  it('first fail sets trustScore to 0.0', () => {
    const agent = makeAgent();
    const updated = updateTrust(agent, 'run-1', 'fail');
    expect(updated.trustScore).toBe(0.0);
    expect(updated.trustLedger).toHaveLength(1);
  });

  it('rolling score after mixed runs', () => {
    let agent = makeAgent();
    // 7 passes, 3 fails = 0.7
    const results: Array<'pass' | 'fail'> = [
      'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass',
      'fail', 'fail', 'fail',
    ];
    results.forEach((v, i) => {
      agent = updateTrust(agent, `run-${i}`, v);
    });
    expect(agent.trustScore).toBeCloseTo(0.7);
    expect(agent.trustLedger).toHaveLength(10);
  });

  it('ledger is capped at 1000 entries', () => {
    let agent = makeAgent();
    // build 1000 existing ledger entries
    const existing = Array.from({ length: 1000 }, (_, i) => ({
      runId: `old-${i}`,
      verdict: 'pass' as const,
      at: new Date().toISOString(),
    }));
    agent = { ...agent, trustLedger: existing, trustScore: 1.0 };
    const updated = updateTrust(agent, 'run-new', 'fail');
    expect(updated.trustLedger).toHaveLength(1000);
    // last entry should be the new fail
    expect(updated.trustLedger[999].runId).toBe('run-new');
  });

  it('does not mutate original agent', () => {
    const agent = makeAgent();
    const updated = updateTrust(agent, 'run-1', 'pass');
    expect(agent.trustLedger).toHaveLength(0);
    expect(updated.trustLedger).toHaveLength(1);
  });
});
