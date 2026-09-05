import { describe, expect, it } from 'vitest';
import { verify } from '@/lib/os/agents/verify';
import { updateTrust } from '@/lib/os/agents/trust';
import { createStubRuntime } from '@/lib/os/agents/runtime';
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

// ── createStubRuntime ────────────────────────────────────────────────────────

describe('createStubRuntime', () => {
  it('returns correct shape without calling Claude API', async () => {
    const agent = makeAgent();
    const runtime = createStubRuntime();
    const result = await runtime.run(agent, { prompt: 'hello' });

    // verifyResult
    expect(result.verifyResult.pass).toBe(true);

    // run shape
    expect(result.run.orgId).toBe(agent.orgId);
    expect(result.run.agentId).toBe(agent.id);
    expect(result.run.ok).toBe(true);
    expect(result.run.tokensIn).toBe(0);
    expect(result.run.tokensOut).toBe(0);
    expect(result.run.costUsd).toBe(0);
    expect(result.run.summary).toBe('stub run');
    expect(result.run.id).toMatch(/^stub-/);

    // output echoes input
    const output = result.output as Record<string, unknown>;
    expect((output.echo as Record<string, unknown>).prompt).toBe('hello');
    expect(output.agent).toBe(agent.name);
  });

  it('startedAt and finishedAt are valid ISO strings', async () => {
    const agent = makeAgent();
    const runtime = createStubRuntime();
    const { run } = await runtime.run(agent, { prompt: 'test' });

    expect(() => new Date(run.startedAt)).not.toThrow();
    expect(new Date(run.startedAt).toISOString()).toBe(run.startedAt);
    expect(run.finishedAt).toBeDefined();
  });

  it('each run gets a unique id', async () => {
    const agent = makeAgent();
    const runtime = createStubRuntime();
    const r1 = await runtime.run(agent, { prompt: 'a' });
    await new Promise(res => setTimeout(res, 2));
    const r2 = await runtime.run(agent, { prompt: 'b' });
    expect(r1.run.id).not.toBe(r2.run.id);
  });
});
