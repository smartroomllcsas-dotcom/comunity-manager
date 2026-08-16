import { z } from 'zod';

export const WorkflowSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  name: z.string(),
  subtitle: z.string().default(''),
  revenueUsd: z.number().int().default(0),
  ord: z.number().int().default(0),
  steps: z.array(z.unknown()).default([]),
  createdAt: z.string().datetime(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
export type NewWorkflow = Omit<Workflow, 'createdAt'>;
