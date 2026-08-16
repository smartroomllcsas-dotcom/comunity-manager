import { describe, it, expect } from 'vitest';
import { createInMemoryRepository } from '@/lib/os/adapters/in-memory';

describe('KnowledgeRepository (in-memory)', () => {
  const orgA = '00000000-0000-4000-a000-000000000001';

  it('upsert + all works', async () => {
    const repo = createInMemoryRepository();
    await repo.knowledge.nodes.upsert(orgA, {
      id: 'n1', orgId: orgA, kind: 'contact', label: 'Diego', summary: '',
      props: {}, source: 'cm_contacts', sourceId: 'contact-42',
      weight: 1.0,
    });
    const all = await repo.knowledge.nodes.all(orgA);
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe('Diego');
  });

  it('edges.forNode returns connected', async () => {
    const repo = createInMemoryRepository();
    await repo.knowledge.nodes.upsert(orgA, { id: 'n1', orgId: orgA, kind: 'contact', label: 'A', summary: '', props: {}, source: null, sourceId: null, weight: 1 });
    await repo.knowledge.nodes.upsert(orgA, { id: 'n2', orgId: orgA, kind: 'topic', label: 'B', summary: '', props: {}, source: null, sourceId: null, weight: 1 });
    await repo.knowledge.edges.insert(orgA, { fromNodeId: 'n1', toNodeId: 'n2', relation: 'mentions', weight: 1, meta: {} });
    const edges = await repo.knowledge.edges.forNode(orgA, 'n1');
    expect(edges).toHaveLength(1);
    expect(edges[0].relation).toBe('mentions');
  });

  it('org isolation', async () => {
    const repo = createInMemoryRepository();
    const orgB = '00000000-0000-4000-a000-000000000002';
    await repo.knowledge.nodes.upsert(orgA, { id: 'n1', orgId: orgA, kind: 'contact', label: 'X', summary: '', props: {}, source: null, sourceId: null, weight: 1 });
    expect(await repo.knowledge.nodes.all(orgB)).toHaveLength(0);
  });
});
