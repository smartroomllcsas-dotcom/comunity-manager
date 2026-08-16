import { z } from 'zod';

export const AgentRunSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  agentId: z.string(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().optional(),
  ok: z.boolean().nullable().optional(),
  summary: z.string().default(''),
  input: z.unknown().nullable().optional(),
  output: z.unknown().nullable().optional(),
  tokensIn: z.number().int().nullable().optional(),
  tokensOut: z.number().int().nullable().optional(),
  costUsd: z.number().nullable().optional(),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;
export type NewAgentRun = Omit<AgentRun, 'id' | 'summary'> & { summary?: string };
