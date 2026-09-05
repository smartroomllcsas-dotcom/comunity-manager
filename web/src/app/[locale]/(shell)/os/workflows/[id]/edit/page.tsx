import { notFound } from 'next/navigation';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { WorkflowEditor } from '@/components/os/WorkflowEditor';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditWorkflowPage({ params }: Props) {
  const { id } = await params;
  const orgId = await requireOrgIdFromRequest();
  const repo = await getOSRepositoryForRequest();
  const workflow = await repo.workflows.byId(orgId, id);

  if (!workflow) notFound();

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Edit Workflow</h1>
          <p className="page-sub">{workflow.name}</p>
        </div>
      </div>
      <WorkflowEditor initial={workflow} />
    </main>
  );
}
