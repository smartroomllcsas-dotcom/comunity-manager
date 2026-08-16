import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepository } from '../../src/lib/os/adapters/in-memory';
import type { OSRepository } from '../../src/lib/os/repository';

describe('agent templates (in-memory)', () => {
  let repo: OSRepository;

  beforeEach(() => {
    repo = createInMemoryRepository();
  });

  it('all() returns seeded templates with featured first', async () => {
    const templates = await repo.templates.all();
    expect(templates.length).toBeGreaterThanOrEqual(3);
    // Featured template should come first
    const featuredIdx = templates.findIndex(t => t.featured);
    const nonFeaturedIdx = templates.findIndex(t => !t.featured);
    if (featuredIdx !== -1 && nonFeaturedIdx !== -1) {
      expect(featuredIdx).toBeLessThan(nonFeaturedIdx);
    }
  });

  it('byId() returns the correct template or null', async () => {
    const all = await repo.templates.all();
    const first = all[0];
    const found = await repo.templates.byId(first.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(first.id);
    const missing = await repo.templates.byId('nonexistent-id');
    expect(missing).toBeNull();
  });

  it('incrementInstalls() increases installsCount by 1', async () => {
    const all = await repo.templates.all();
    const tpl = all[0];
    const before = tpl.installsCount;
    await repo.templates.incrementInstalls(tpl.id);
    const after = await repo.templates.byId(tpl.id);
    expect(after!.installsCount).toBe(before + 1);
  });
});
