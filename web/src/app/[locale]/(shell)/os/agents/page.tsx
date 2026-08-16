import { getTranslations } from 'next-intl/server';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { AgentRoster } from '@/components/os/AgentRoster';
import { AgentDetailPanel } from '@/components/os/AgentDetailPanel';

export default async function OsAgentsPage() {
  const t = await getTranslations('os.agents');
  const [repo, orgId] = await Promise.all([
    getOSRepositoryForRequest(),
    requireOrgIdFromRequest(),
  ]);

  const agents = await repo.agents.all(orgId);

  const firstAgent = agents[0] ?? null;
  const initialRuns = firstAgent
    ? await repo.agentRuns.byAgent(orgId, firstAgent.id, 20)
    : [];

  if (agents.length === 0) {
    return (
      <main className="content">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('title')}</h1>
            <div className="page-sub">No agents configured yet</div>
          </div>
        </div>
        <div className="panel" style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="panel-head">
            <div className="panel-title">Get started</div>
          </div>
          <div className="px-4 py-4 text-[12px] text-os-muted space-y-3">
            <p>No agents found for this organization.</p>
            <p>
              Run the seed endpoint to populate demo data:
            </p>
            <code className="block rounded border border-os-border bg-os-surface2 px-3 py-2 font-mono text-[10.5px] text-os-text">
              POST /api/os/dev/seed
            </code>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">{agents.length} agent{agents.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 'var(--sp-4)',
          alignItems: 'start',
        }}
      >
        {/* Left sidebar — agent roster */}
        <div className="sticky top-0">
          <AgentRoster agents={agents} />
        </div>

        {/* Right — detail panel for the first agent (client handles selection in Sprint 2) */}
        <AgentDetailPanel agent={firstAgent!} initialRuns={initialRuns} />
      </div>
    </main>
  );
}
