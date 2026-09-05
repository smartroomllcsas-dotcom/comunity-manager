import { z } from 'zod';

const AGENT_TIERS = ['lead', 'specialist', 'worker'] as const;

export const AgentTemplateSchema = z.object({
  id: z.string(),
  publisher: z.string().default('official'),
  name: z.string(),
  description: z.string().default(''),
  category: z.string(),
  icon: z.string().nullable().optional(),
  tier: z.enum(AGENT_TIERS).default('worker'),
  model: z.string().default('claude-sonnet-4-6'),
  tools: z.array(z.string()).default([]),
  constitution: z.record(z.string(), z.unknown()).default({}),
  suggestedSkills: z.array(z.string()).default([]),
  suggestedGoals: z.array(z.string()).default([]),
  installsCount: z.number().int().default(0),
  featured: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;
