import { z } from 'zod';

export const KnowledgeEdgeSchema = z.object({
  id: z.number().int(),
  orgId: z.string().uuid(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  relation: z.string(),
  weight: z.number().default(1.0),
  meta: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});
export type KnowledgeEdge = z.infer<typeof KnowledgeEdgeSchema>;
export type NewKnowledgeEdge = Omit<KnowledgeEdge, 'id' | 'orgId' | 'createdAt'> & {
  createdAt?: string;
};
