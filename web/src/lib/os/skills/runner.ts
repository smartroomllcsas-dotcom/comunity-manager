import { CronExpressionParser } from 'cron-parser';
import type { OSRepository } from '@/lib/os/repository';
import type { Skill } from '@/lib/os/schemas/skill';

// Skill execution registry — Sprint 3 has 3 built-in skills
const SKILL_HANDLERS: Record<
  string,
  (repo: OSRepository, orgId: string, skill: Skill) => Promise<{ ok: boolean; summary: string }>
> = {
  'brain.refresh_recent_contacts': async (_repo, _orgId) => {
    // TODO Sprint 4: touch nodes for contacts messaged in last 24h
    return { ok: true, summary: 'brain.refresh_recent_contacts stub' };
  },
  'goals.sentinel_check': async (_repo, _orgId) => {
    // TODO Sprint 4: invoke sentinel inline
    return { ok: true, summary: 'goals.sentinel_check stub' };
  },
  'social.snapshot_followers': async (_repo, _orgId) => {
    // TODO Sprint 4: snapshot cm_metrics_account
    return { ok: true, summary: 'social.snapshot_followers stub' };
  },
};

export function shouldRunNow(schedule: string, lastRunAt: Date | null): boolean {
  if (!schedule || schedule.trim() === '') return false;
  try {
    const interval = CronExpressionParser.parse(schedule, {
      currentDate: lastRunAt ?? new Date(0),
    });
    const next = interval.next().toDate();
    return next.getTime() <= Date.now();
  } catch {
    return false;
  }
}

export async function runDueSkills(
  repo: OSRepository,
  orgId: string,
): Promise<Array<{ skillId: string; ok: boolean; summary: string; skipped?: string }>> {
  const skills = await repo.skills.all(orgId);
  const results: Array<{ skillId: string; ok: boolean; summary: string; skipped?: string }> = [];

  for (const skill of skills) {
    if (skill.status !== 'live') {
      results.push({ skillId: skill.id, ok: true, summary: 'skipped: not live', skipped: 'not_live' });
      continue;
    }
    if (!skill.schedule) {
      results.push({ skillId: skill.id, ok: true, summary: 'skipped: no schedule', skipped: 'no_schedule' });
      continue;
    }

    // TODO Sprint 4: track last_run_at per-skill. Sprint 3 uses activity feed.
    const recent = await repo.activity.recent(orgId, 100);
    const lastRun = recent.find(
      (a) => a.kind === 'skill.run' && (a.payload as Record<string, unknown>)?.skillId === skill.id,
    );
    const lastRunAt = lastRun ? new Date(lastRun.at) : null;

    if (!shouldRunNow(skill.schedule, lastRunAt)) {
      results.push({ skillId: skill.id, ok: true, summary: 'not due yet', skipped: 'not_due' });
      continue;
    }

    const handler = SKILL_HANDLERS[skill.name] ?? SKILL_HANDLERS[skill.id];
    if (!handler) {
      results.push({ skillId: skill.id, ok: false, summary: 'no handler registered', skipped: 'no_handler' });
      continue;
    }

    try {
      const res = await handler(repo, orgId, skill);
      await repo.activity.insert(orgId, {
        kind: 'skill.run',
        actorId: skill.id,
        summary: `Skill ${skill.name}: ${res.summary}`,
        payload: { skillId: skill.id, ok: res.ok },
        ok: res.ok,
      });
      results.push({ skillId: skill.id, ...res });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ skillId: skill.id, ok: false, summary: msg });
    }
  }

  return results;
}
