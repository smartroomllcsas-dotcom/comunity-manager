import { z } from 'zod';

/**
 * OS Task schema. Kanban-style task queue fed by agents.
 * Persisted in `smarttalk.os_tasks` — see /web/migrations/os_tasks.sql
 */
export const OsTaskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export type OsTaskStatus = z.infer<typeof OsTaskStatusSchema>;

export const OsTaskSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  brandId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().default(''),
  status: OsTaskStatusSchema.default('todo'),
  assigneeAgentId: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OsTask = z.infer<typeof OsTaskSchema>;
export type NewOsTask = Omit<OsTask, 'id' | 'createdAt' | 'updatedAt'>;

export const OsTaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: OsTaskStatusSchema.optional(),
  assigneeAgentId: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
export type OsTaskUpdate = z.infer<typeof OsTaskUpdateSchema>;
