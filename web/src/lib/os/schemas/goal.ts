import { z } from 'zod';

const GOAL_STATUSES = ['ok', 'breach', 'unknown'] as const;

export const GoalStatus = z.enum(GOAL_STATUSES);
export type GoalStatus = z.infer<typeof GoalStatus>;

export const GoalSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  title: z.string(),
  spec: z.record(z.string(), z.unknown()).default({}),
  ownerAgentId: z.string().nullable().optional(),
  cadence: z.string(),
  lastCheckedAt: z.string().datetime().nullable().optional(),
  lastStatus: GoalStatus.nullable().optional(),
  lastEvidence: z.unknown().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type Goal = z.infer<typeof GoalSchema>;
export type NewGoal = Omit<Goal, 'createdAt' | 'spec'> & { spec?: Record<string, unknown> };
