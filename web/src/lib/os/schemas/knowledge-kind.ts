import { z } from 'zod';

export const KnowledgeKindSchema = z.object({
  id:          z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, 'id must be lowercase alphanumeric/dash/underscore'),
  orgId:       z.string().uuid(),
  label:       z.string().min(1).max(80),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color #rrggbb').default('#5ec9f8'),
  icon:        z.string().max(64).nullable().optional(),
  description: z.string().default(''),
  system:      z.boolean().default(false),
  createdAt:   z.string().datetime().optional(),
});

export type KnowledgeKind = z.infer<typeof KnowledgeKindSchema>;

export const NewKnowledgeKindSchema = KnowledgeKindSchema.omit({ orgId: true, createdAt: true });
export type NewKnowledgeKind = z.infer<typeof NewKnowledgeKindSchema>;
