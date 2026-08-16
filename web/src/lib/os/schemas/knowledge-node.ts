import { z } from 'zod';

/** Legacy enum kept for reference; DB constraint has been dropped — kind is now any text */
const NODE_KINDS = ['contact','topic','decision','event','tag','custom'] as const;
export const NodeKind = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKind>;

export const KnowledgeNodeSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  /** Free-form text validated at app layer via os_knowledge_kinds table */
  kind: z.string(),
  label: z.string(),
  summary: z.string().default(''),
  props: z.record(z.string(), z.unknown()).default({}),
  source: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  weight: z.number().default(1.0),
  vector: z.unknown().nullable().optional(),
});
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;
export type NewKnowledgeNode = Omit<KnowledgeNode, 'firstSeenAt' | 'lastSeenAt'> & {
  firstSeenAt?: string;
  lastSeenAt?: string;
};
