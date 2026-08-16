import { z } from 'zod';

export const ActivitySchema = z.object({
  id: z.number().int(),
  orgId: z.string().uuid(),
  kind: z.string(),
  actorId: z.string().nullable().optional(),
  at: z.string().datetime(),
  summary: z.string().default(''),
  payload: z.record(z.string(), z.unknown()).default({}),
  ok: z.boolean().nullable().optional(),
});

export type Activity = z.infer<typeof ActivitySchema>;
export type NewActivity = Omit<Activity, 'id' | 'at' | 'summary' | 'payload'> & {
  at?: string;
  summary?: string;
  payload?: Record<string, unknown>;
};
