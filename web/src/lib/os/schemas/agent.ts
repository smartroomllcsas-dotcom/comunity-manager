import { z } from 'zod';

const AGENT_STATUSES = ['active', 'idle', 'training', 'planned'] as const;
const AGENT_TIERS = ['lead', 'specialist', 'worker'] as const;

export const AgentStatus = z.enum(AGENT_STATUSES);
export type AgentStatus = z.infer<typeof AgentStatus>;
export const AgentTier = z.enum(AGENT_TIERS);
export type AgentTier = z.infer<typeof AgentTier>;

export const AgentSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  departmentId: z.string(),
  name: z.string(),
  role: z.string().default(''),
  status: AgentStatus,
  tier: AgentTier,
  description: z.string().default(''),
  model: z.string().default(''),
  tools: z.array(z.string()).default([]),
  parentId: z.string().nullable().optional(),
  instance: z.string().default('builtin'),
  constitution: z.record(z.string(), z.unknown()).default({}),
  trustScore: z.number().min(0).max(1).default(0.5),
  trustLedger: z.array(z.object({
    runId: z.string(),
    verdict: z.enum(['pass', 'fail'] as const),
    at: z.string().datetime(),
  })).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Agent = z.infer<typeof AgentSchema>;
export type NewAgent = Omit<Agent, 'createdAt' | 'updatedAt'>;
