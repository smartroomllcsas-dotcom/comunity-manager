import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Plus, Workflow as WorkflowIcon } from 'lucide-react';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { WorkflowMap } from '@/components/os/workflows/WorkflowMap';
import { EmptyState } from '@/components/os/EmptyState';

/**
 * Workflows page — ported from FounderOS-DEMO/app/workflows/page.tsx.
 *
 * Server component: fetches workflows for the current org via the OS repo
 * and hands them to the client WorkflowMap for interactive rendering.
 * Kind-based visualization (trigger/condition/action/wait/branch) — the
 * FounderOS "leak / automation" columns are irrelevant to CM's schema and
 * were dropped by the porter (see WorkflowMap.tsx for the rationale).
 */
export default async function WorkflowsPage() {
  const t = await getTranslations('os.workflows');
  const orgId = await requireOrgIdFromRequest();
  const repo = await getOSRepositoryForRequest();
  const workflows = await repo.workflows.all(orgId);

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t?.('title') ?? 'Workflows'}</h1>
          <p className="page-sub">{t?.('subtitle') ?? 'Automatizaciones multi-paso'}</p>
        </div>
        <Link
          href="/os/workflows/new"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          style={{ background: 'oklch(70% 0.14 250)', color: 'white' }}
        >
          <Plus className="h-4 w-4" /> New Workflow
        </Link>
      </div>

      {workflows.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="Aún no hay workflows"
          description="Crea tu primer workflow para automatizar procesos multi-paso: triggers, condiciones, acciones y waits."
          action={{ label: 'Crear workflow', href: '/os/workflows/new' }}
        />
      ) : (
        <WorkflowMap workflows={workflows} />
      )}
    </main>
  );
}
