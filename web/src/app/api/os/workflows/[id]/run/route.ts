import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest, getOSRepositoryForRequest } from '@/lib/os/server';
import { runWorkflow } from '@/lib/os/workflows/runner';

const BodySchema = z.object({
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const { id } = await params;
    const orgId = await requireOrgIdFromRequest();
    const body = BodySchema.parse(await req.json().catch(() => ({})));
    const repo = await getOSRepositoryForRequest();
    const wf = await repo.workflows.byId(orgId, id);
    if (!wf) return NextResponse.json({ error: 'workflow_not_found' }, { status: 404 });
    const result = await runWorkflow(repo, orgId, wf, body.context ?? {});
    return NextResponse.json(result);
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
