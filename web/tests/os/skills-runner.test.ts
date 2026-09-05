import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldRunNow, runDueSkills } from '@/lib/os/skills/runner';
import type { OSRepository } from '@/lib/os/repository';
import type { Skill } from '@/lib/os/schemas/skill';

// ── shouldRunNow ──────────────────────────────────────────────────────────────

describe('shouldRunNow', () => {
  it('returns true when last run was 20 min ago and schedule is every 15 min', () => {
    const lastRun = new Date(Date.now() - 20 * 60 * 1000);
    expect(shouldRunNow('*/15 * * * *', lastRun)).toBe(true);
  });

  it('returns false when last run was only 1 second ago and schedule is every 15 min', () => {
    // 1 second ago: the next */15 tick from that point is at least ~14 min away — not yet reached
    const lastRun = new Date(Date.now() - 1000);
    expect(shouldRunNow('*/15 * * * *', lastRun)).toBe(false);
  });

  it('returns false for an invalid cron expression', () => {
    expect(shouldRunNow('not-a-cron', null)).toBe(false);
  });
});

// ── runDueSkills ──────────────────────────────────────────────────────────────

describe('runDueSkills', () => {
  it('skips a skill with no registered handler and marks skipped=no_handler', async () => {
    const skill: Skill = {
      id: 'skill-xyz',
      orgId: '00000000-0000-0000-0000-000000000001',
      name: 'unknown.handler',
      category: 'test',
      description: '',
      status: 'live',
      tools: [],
      markdown: '',
      schedule: '*/5 * * * *', // always due (lastRunAt will be null)
      ord: 0,
    };

    const repo = {
      skills: {
        all: vi.fn().mockResolvedValue([skill]),
      },
      activity: {
        recent: vi.fn().mockResolvedValue([]), // no prior runs → lastRunAt null → due
        insert: vi.fn().mockResolvedValue({ id: 1 }),
      },
    } as unknown as OSRepository;

    const results = await runDueSkills(repo, skill.orgId);

    expect(results).toHaveLength(1);
    expect(results[0].skipped).toBe('no_handler');
    expect(results[0].ok).toBe(false);
    // insert should NOT be called since we never ran the handler
    expect((repo.activity.insert as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
