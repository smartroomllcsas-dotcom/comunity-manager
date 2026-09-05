import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { OsTaskSchema, type OsTask, type OsTaskStatus, type OsTaskUpdate, type NewOsTask } from './schemas/task';

/**
 * OS Tasks live in `smarttalk.os_tasks`. Unlike the rest of the OS entities
 * (public.os_*), this table lives in the smarttalk schema so it can FK to
 * smarttalk.brands / cm_agents naturally.
 *
 * Repository wraps a smarttalk-schema Supabase client. The return type is
 * inferred loose since `db.schema: 'smarttalk'` no longer matches the default
 * `SupabaseClient<any, 'public', 'public', any, any>` generic.
 */

async function getSmarttalkClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
      db: { schema: 'smarttalk' },
    }
  );
}

type Row = {
  id: string;
  org_id: string;
  brand_id: string | null;
  title: string;
  description: string | null;
  status: OsTaskStatus;
  assignee_agent_id: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToTask(r: Row): OsTask {
  return OsTaskSchema.parse({
    id: r.id,
    orgId: r.org_id,
    brandId: r.brand_id,
    title: r.title,
    description: r.description ?? '',
    status: r.status,
    assigneeAgentId: r.assignee_agent_id,
    dueAt: r.due_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

export async function listTasks(orgId: string, brandIds: string[]): Promise<OsTask[]> {
  const sb = await getSmarttalkClient();
  let q = sb.from('os_tasks').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (brandIds.length > 0) {
    q = q.in('brand_id', brandIds);
  }
  const { data, error } = await q;
  if (error) throw new Error(`os_tasks.list: ${error.message}`);
  return (data ?? []).map((r) => rowToTask(r as Row));
}

export async function createTask(orgId: string, task: NewOsTask): Promise<OsTask> {
  const sb = await getSmarttalkClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('os_tasks')
    .insert({
      org_id: orgId,
      brand_id: task.brandId ?? null,
      title: task.title,
      description: task.description ?? '',
      status: task.status ?? 'todo',
      assignee_agent_id: task.assigneeAgentId ?? null,
      due_at: task.dueAt ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw new Error(`os_tasks.create: ${error.message}`);
  return rowToTask(data as Row);
}

export async function updateTask(orgId: string, id: string, patch: OsTaskUpdate): Promise<OsTask> {
  const sb = await getSmarttalkClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assigneeAgentId !== undefined) row.assignee_agent_id = patch.assigneeAgentId;
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt;
  const { data, error } = await sb
    .from('os_tasks')
    .update(row)
    .eq('org_id', orgId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`os_tasks.update: ${error.message}`);
  return rowToTask(data as Row);
}

export async function deleteTask(orgId: string, id: string): Promise<void> {
  const sb = await getSmarttalkClient();
  const { error } = await sb.from('os_tasks').delete().eq('org_id', orgId).eq('id', id);
  if (error) throw new Error(`os_tasks.delete: ${error.message}`);
}
