import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest, getOSRepositoryForRequest } from '@/lib/os/server';
import { WorkflowSchema } from '@/lib/os/schemas/workflow';

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    const workflows = await repo.workflows.all(orgId);
    return NextResponse.json({ workflows });
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
    const parsed = WorkflowSchema.parse({
      ...body,
      orgId,
      createdAt: body.createdAt ?? new Date().toISOString(),
    });
    const repo = await getOSRepositoryForRequest();
    await repo.workflows.upsert(orgId, parsed);
    return NextResponse.json({ ok: true });
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
