import { getTranslations } from 'next-intl/server';
import { SkillsGrid, type SkillCard } from '@/components/os/SkillsGrid';
import { TaskBoard, type AgentTask } from '@/components/os/TaskBoard';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';

// ── page ─────────────────────────────────────────────────────────────────────

export default async function OsSkillsPage() {
  const t = await getTranslations('os.skills');

  // Fetch skills from OS repository
  let skillCards: SkillCard[] = [];
  let fetchError: string | null = null;

  try {
    const [repo, orgId] = await Promise.all([
      getOSRepositoryForRequest(),
      requireOrgIdFromRequest(),
    ]);
    const skills = await repo.skills.all(orgId);

    skillCards = skills.map((s) => ({
      id: s.id,
      name: s.name,
      group: s.category,
      description: s.description,
      meta: s.ownerAgentId ?? 'community-os',
      filePath: `os_skills/${s.id}`,
      status: s.status as SkillCard['status'],
      markdown: s.markdown || undefined,
    }));
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'unknown error';
  }

  // Placeholder tasks for the kanban — TODO Sprint 2: wire real os_agent_runs
  const PLACEHOLDER_TASKS: AgentTask[] = [
    { id: 'task-1', title: 'Audit Instagram engagement rate Q3', agentId: 'content-agent', status: 'doing' },
    { id: 'task-2', title: 'Generate weekly social calendar', agentId: 'content-agent', status: 'open' },
    { id: 'task-3', title: 'Update brand voice for holiday campaign', agentId: 'brand-agent', status: 'open' },
    { id: 'task-4', title: 'Analyze competitor ad spend', agentId: 'analytics-agent', status: 'done' },
    { id: 'task-5', title: 'Draft outreach sequences for hot leads', agentId: 'content-agent', status: 'done' },
  ];

  const AGENT_NAMES: Record<string, string> = {
    'content-agent': 'Content Agent',
    'brand-agent': 'Brand Agent',
    'analytics-agent': 'Analytics Agent',
  };

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-sub">{t('subtitle')}</p>
        </div>
      </div>

      {/* Skills grid */}
      <section className="mb-10">
        {fetchError ? (
          <div className="rounded-lg border border-os-border bg-os-surface px-5 py-4 font-mono text-[11px] text-os-dim">
            Error loading skills: {fetchError}
          </div>
        ) : skillCards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-os-border bg-os-surface px-6 py-10 text-center">
            <p className="font-mono text-[13px] text-os-muted">{t('emptyState')}</p>
            <p className="mt-2 font-mono text-[11px] text-os-dim">
              Run the seed: <code className="rounded bg-os-surface2 px-1.5 py-0.5 text-os-accent">pnpm seed:os</code>
            </p>
          </div>
        ) : (
          <SkillsGrid
            cards={skillCards}
            sourceNote={`${skillCards.length} skills · ${t('subtitle')}`}
          />
        )}
      </section>

      {/* Agent task board */}
      <section>
        <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-os-dim">agent task board</div>
        {/* TODO Sprint 2: fetch real tasks from os_agent_runs */}
        <TaskBoard initialTasks={PLACEHOLDER_TASKS} agentNames={AGENT_NAMES} />
      </section>
    </main>
  );
}
