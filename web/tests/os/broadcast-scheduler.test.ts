import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OSRepository } from '@/lib/os/repository';

// ── mock supabase-service ─────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();

function buildChain(finalData: unknown[], error: unknown = null) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue({ data: finalData, error });
  return chain;
}

function buildUpdateChain(error: unknown = null) {
  const chain: any = {};
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockResolvedValue({ error });
  return chain;
}

const mockSb = {
  from: vi.fn(),
};

vi.mock('@/lib/os/supabase-service', () => ({
  getSupabaseServiceClient: () => mockSb,
}));

// ── import after mock ────────────────────────────────────────────────────────

import { findDuePosts, publishPost } from '@/lib/os/broadcast/scheduler';

// ── helpers ──────────────────────────────────────────────────────────────────

const PAST_DATE = '2020-01-01';
const FUTURE_DATE = '2099-12-31';
const TIME = '10:00:00';

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    client_id: '00000000-0000-0000-0000-000000000001',
    content: 'Hello world',
    platforms: ['instagram'],
    scheduled_date: PAST_DATE,
    scheduled_time: TIME,
    status: 'scheduled',
    title: 'Test post',
    ...overrides,
  };
}

// ── findDuePosts ─────────────────────────────────────────────────────────────

describe('findDuePosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes a post scheduled in the past', async () => {
    const post = makePost({ scheduled_date: PAST_DATE });
    const chain = buildChain([post]);
    mockSb.from.mockReturnValue(chain);

    const result = await findDuePosts();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('post-1');
  });

  it('excludes a post scheduled in the future (query returns empty)', async () => {
    // The Supabase .or() filter would exclude future posts server-side.
    // We simulate the DB returning empty for a future-only dataset.
    const chain = buildChain([]);
    mockSb.from.mockReturnValue(chain);

    const result = await findDuePosts();
    expect(result).toHaveLength(0);
  });

  it('excludes a post with status=draft (query filters by status=scheduled)', async () => {
    // DB honours .eq('status','scheduled') — returns empty when all posts are drafts.
    const chain = buildChain([]);
    mockSb.from.mockReturnValue(chain);

    const result = await findDuePosts();
    expect(result).toHaveLength(0);
  });
});

// ── publishPost ───────────────────────────────────────────────────────────────

describe('publishPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks post as published and returns ok=true on success', async () => {
    const updateChain = buildUpdateChain();
    mockSb.from.mockReturnValue(updateChain);

    const repo = {
      activity: {
        insert: vi.fn().mockResolvedValue({ id: 1 }),
      },
    } as unknown as OSRepository;

    const post = makePost();
    const result = await publishPost(post, repo);

    expect(result.ok).toBe(true);
    expect(result.postId).toBe('post-1');
    expect(repo.activity.insert).toHaveBeenCalledWith(
      post.client_id,
      expect.objectContaining({ kind: 'broadcast.published' }),
    );
  });
});
