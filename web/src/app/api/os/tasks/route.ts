import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { resolveBrandIds } from '@/lib/os/scope';
import { listTasks, createTask } from '@/lib/os/tasks-repository';
import { OsTaskSchema } from '@/lib/os/schemas/task';

export async function GET(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const brandIds = await resolveBrandIds(orgId);
    const url = new URL(req.url);
    const agentFilter = url.searchParams.get('agent');
    let tasks = await listTasks(orgId, brandIds);
    if (agentFilter) tasks = tasks.filter((t) => t.assigneeAgentId === agentFilter);
    return NextResponse.json({ tasks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('unauthorized')) return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const body = await req.json();
    // Validate the incoming shape (id/createdAt/updatedAt are server-assigned)
    const now = new Date().toISOString();
    const parsed = OsTaskSchema.parse({
      id: '00000000-0000-0000-0000-000000000000',
      orgId,
      brandId: body.brandId ?? null,
      title: body.title,
      description: body.description ?? '',
      status: body.status ?? 'todo',
      assigneeAgentId: body.assigneeAgentId ?? null,
      dueAt: body.dueAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const created = await createTask(orgId, {
      orgId,
      brandId: parsed.brandId ?? null,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      assigneeAgentId: parsed.assigneeAgentId ?? null,
      dueAt: parsed.dueAt ?? null,
    });
    return NextResponse.json({ task: created });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'ZodError') {
      return NextResponse.json(
        { error: 'invalid_input', details: (e as unknown as { issues: unknown }).issues },
        { status: 400 }
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('unauthorized')) return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
