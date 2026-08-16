import { WorkflowEditor } from '@/components/os/WorkflowEditor';

export default function NewWorkflowPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">New Workflow</h1>
          <p className="page-sub">Define steps, conditions, and actions</p>
        </div>
      </div>
      <WorkflowEditor />
    </main>
  );
}
