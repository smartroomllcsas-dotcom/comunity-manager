import type { OSRepository } from '@/lib/os/repository';
import type { Workflow, WorkflowStep } from '@/lib/os/schemas/workflow';

type StepResult = { ok: boolean; output?: unknown; error?: string };
type StepHandler = (step: WorkflowStep, ctx: Record<string, unknown>) => Promise<StepResult>;

const STEP_HANDLERS: Record<string, StepHandler> = {
  trigger: async () => ({ ok: true, output: null }),

  condition: async (_step, _ctx) => {
    // Sprint 3 stub: always pass. Sprint 4: eval step.config.expression against ctx
    return { ok: true, output: true };
  },

  action: async (step, _ctx) => {
    // Sprint 3 stub: log action. Sprint 4: dispatch to real actions registry
    return { ok: true, output: { action: step.label } };
  },

  wait: async (step) => {
    const ms = Number((step.config as Record<string, unknown>).ms ?? 0);
    if (ms > 0 && ms < 60_000) await new Promise((r) => setTimeout(r, ms));
    return { ok: true };
  },

  branch: async () => ({ ok: true }),
};

export type RunTrace = Array<{ stepId: string; ok: boolean; output?: unknown; error?: string }>;

export interface RunResult {
  ok: boolean;
  trace: RunTrace;
  error?: string;
}

export async function runWorkflow(
  repo: OSRepository,
  orgId: string,
  workflow: Workflow,
  initialContext: Record<string, unknown> = {}
): Promise<RunResult> {
  const trace: RunTrace = [];
  const ctx = { ...initialContext };
  const stepMap = new Map(workflow.steps.map((s) => [s.id, s]));

  const trigger = workflow.steps.find((s) => s.kind === 'trigger');
  if (!trigger) {
    return { ok: false, trace, error: 'no trigger step' };
  }

  let currentId: string | null | undefined = trigger.id;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      trace.push({ stepId: currentId, ok: false, error: 'cycle detected' });
      break;
    }
    visited.add(currentId);

    const step = stepMap.get(currentId);
    if (!step) break;

    const handler = STEP_HANDLERS[step.kind];
    if (!handler) {
      trace.push({ stepId: currentId, ok: false, error: `no handler for kind=${step.kind}` });
      break;
    }

    try {
      const result = await handler(step, ctx);
      trace.push({ stepId: step.id, ...result });
      if (!result.ok) {
        currentId = step.onError ?? null;
        continue;
      }
      currentId = step.next ?? null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      trace.push({ stepId: step.id, ok: false, error: msg });
      currentId = step.onError ?? null;
    }
  }

  const allOk = trace.length > 0 && trace.every((t) => t.ok);

  await repo.activity.insert(orgId, {
    kind: 'workflow.run',
    actorId: workflow.id,
    summary: `Workflow ${workflow.name}: ${trace.length} steps executed`,
    payload: { workflowId: workflow.id, trace },
    ok: allOk,
  });

  return { ok: allOk, trace };
}
