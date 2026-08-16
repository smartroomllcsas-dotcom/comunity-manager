import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepository } from '../../src/lib/os/adapters/in-memory';
import type { OSRepository } from '../../src/lib/os/repository';
import type { Agent } from '../../src/lib/os/schemas/agent';

const ORG_A = '00000000-0000-4000-a000-000000000001';
const ORG_B = '00000000-0000-4000-a000-000000000002';
const TS = '2026-08-15T00:00:00.000Z';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    orgId: ORG_A,
    departmentId: 'support',
    name: 'Auto-responder',
    role: '',
    status: 'active',
    tier: 'worker',
    description: '',
    model: 'sonnet',
    tools: [],
    parentId: null,
    instance: 'builtin',
    constitution: {},
    trustScore: 0.9,
    trustLedger: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('OSRepository (in-memory)', () => {
  let repo: OSRepository;

  beforeEach(() => {
    repo = createInMemoryRepository();
  });

  // ── AGENTS ────────────────────────────────────────────────────────────────

  it('agents: upsert + all returns the agent', async () => {
    await repo.agents.upsert(ORG_A, makeAgent());
    const all = await repo.agents.all(ORG_A);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Auto-responder');
  });

  it('agents: byId returns null when missing', async () => {
    const result = await repo.agents.byId(ORG_A, 'nonexistent');
    expect(result).toBeNull();
  });

  it('agents: byId returns agent when present', async () => {
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'x99' }));
    const result = await repo.agents.byId(ORG_A, 'x99');
    expect(result?.id).toBe('x99');
  });

  it('agents: byDepartment filters correctly', async () => {
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'a1', departmentId: 'support' }));
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'a2', departmentId: 'sales' }));
    const support = await repo.agents.byDepartment(ORG_A, 'support');
    expect(support).toHaveLength(1);
    expect(support[0].id).toBe('a1');
  });

  it('agents: delete removes the agent', async () => {
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'del1' }));
    await repo.agents.delete(ORG_A, 'del1');
    expect(await repo.agents.byId(ORG_A, 'del1')).toBeNull();
  });

  it('agents: upsert updates existing', async () => {
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'a1', name: 'Old' }));
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'a1', name: 'New' }));
    const all = await repo.agents.all(ORG_A);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('New');
  });

  it('ORG ISOLATION — agent from orgA not visible from orgB', async () => {
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'a1' }));
    const fromB = await repo.agents.all(ORG_B);
    expect(fromB).toHaveLength(0);
  });

  it('ORG ISOLATION — byId from wrong org returns null', async () => {
    await repo.agents.upsert(ORG_A, makeAgent({ id: 'a1' }));
    expect(await repo.agents.byId(ORG_B, 'a1')).toBeNull();
  });

  // ── GOALS ─────────────────────────────────────────────────────────────────

  it('goals: markVerified updates lastStatus / lastEvidence / lastCheckedAt', async () => {
    await repo.goals.upsert(ORG_A, {
      id: 'g1', orgId: ORG_A, title: 'SLA', spec: {}, cadence: '*/15 * * * *', createdAt: TS,
    });
    const verifiedAt = new Date('2026-08-15T12:00:00Z');
    await repo.goals.markVerified(ORG_A, 'g1', verifiedAt, true, { metric: 95 });

    const g = await repo.goals.byId(ORG_A, 'g1');
    expect(g?.lastStatus).toBe('ok');
    expect(g?.lastEvidence).toEqual({ metric: 95 });
    expect(g?.lastCheckedAt).toBe(verifiedAt.toISOString());
  });

  it('goals: markVerified breach sets lastStatus = breach', async () => {
    await repo.goals.upsert(ORG_A, {
      id: 'g2', orgId: ORG_A, title: 'SLA breach', spec: {}, cadence: '0 * * * *', createdAt: TS,
    });
    await repo.goals.markVerified(ORG_A, 'g2', new Date(), false, null);
    const g = await repo.goals.byId(ORG_A, 'g2');
    expect(g?.lastStatus).toBe('breach');
  });

  // ── AGENT RUNS ────────────────────────────────────────────────────────────

  it('agentRuns: recent respects limit + orders by startedAt DESC', async () => {
    const dates = [
      '2026-08-15T01:00:00.000Z',
      '2026-08-15T03:00:00.000Z',
      '2026-08-15T02:00:00.000Z',
    ];
    for (const startedAt of dates) {
      await repo.agentRuns.insert(ORG_A, {
        orgId: ORG_A, agentId: 'a1', startedAt, summary: '',
      });
    }
    const recent = await repo.agentRuns.recent(ORG_A, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].startedAt).toBe('2026-08-15T03:00:00.000Z');
    expect(recent[1].startedAt).toBe('2026-08-15T02:00:00.000Z');
  });

  it('agentRuns: byAgent filters by agentId', async () => {
    await repo.agentRuns.insert(ORG_A, { orgId: ORG_A, agentId: 'agent-x', startedAt: TS });
    await repo.agentRuns.insert(ORG_A, { orgId: ORG_A, agentId: 'agent-y', startedAt: TS });
    const runs = await repo.agentRuns.byAgent(ORG_A, 'agent-x');
    expect(runs).toHaveLength(1);
    expect(runs[0].agentId).toBe('agent-x');
  });

  it('agentRuns: ORG ISOLATION', async () => {
    await repo.agentRuns.insert(ORG_A, { orgId: ORG_A, agentId: 'a1', startedAt: TS });
    expect(await repo.agentRuns.recent(ORG_B)).toHaveLength(0);
  });

  // ── ACTIVITY ──────────────────────────────────────────────────────────────

  it('activity: insert + recent returns item', async () => {
    await repo.activity.insert(ORG_A, {
      orgId: ORG_A, kind: 'agent.run.complete', summary: 'Done', payload: { agentId: 'a1' },
    });
    const items = await repo.activity.recent(ORG_A);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('agent.run.complete');
  });

  it('activity: subscribe returns a callable unsubscribe', () => {
    const unsub = repo.activity.subscribe(ORG_A, () => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('activity: ORG ISOLATION', async () => {
    await repo.activity.insert(ORG_A, { orgId: ORG_A, kind: 'test', payload: {} });
    expect(await repo.activity.recent(ORG_B)).toHaveLength(0);
  });
});
