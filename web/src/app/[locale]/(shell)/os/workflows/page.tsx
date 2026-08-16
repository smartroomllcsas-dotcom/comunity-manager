import { getTranslations } from 'next-intl/server';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { WorkflowsList } from '@/components/os/WorkflowsList';

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
      </div>
      <WorkflowsList workflows={workflows} />
    </main>
  );
}
