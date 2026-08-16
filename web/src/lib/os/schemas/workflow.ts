import { z } from 'zod';

export const WorkflowStepSchema = z.object({
  id: z.string(),
  kind: z.enum(['trigger', 'condition', 'action', 'wait', 'branch']),
  label: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  next: z.string().nullable().optional(),
  onError: z.string().nullable().optional(),
});

export const WorkflowSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  name: z.string(),
  subtitle: z.string().default(''),
  revenueUsd: z.number().int().default(0),
  ord: z.number().int().default(0),
  steps: z.array(WorkflowStepSchema).default([]),
  createdAt: z.string().datetime(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type NewWorkflow = Omit<Workflow, 'createdAt'>;
