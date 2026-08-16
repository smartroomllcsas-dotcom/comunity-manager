import { z } from 'zod';

const SKILL_STATUSES = ['live', 'learning', 'planned'] as const;

export const SkillStatus = z.enum(SKILL_STATUSES);
export type SkillStatus = z.infer<typeof SkillStatus>;

export const SkillSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  description: z.string().default(''),
  ownerAgentId: z.string().nullable().optional(),
  status: SkillStatus.default('planned'),
  tools: z.array(z.string()).default([]),
  markdown: z.string().default(''),
  schedule: z.string().nullable().optional(),
  ord: z.number().int().default(0),
});

export type Skill = z.infer<typeof SkillSchema>;
export type NewSkill = Skill;
