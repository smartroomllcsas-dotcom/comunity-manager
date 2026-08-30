import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest, getOSRepositoryForRequest } from '@/lib/os/server';
import { runAndPersist } from '@/lib/os/agents/runtime';

const BodySchema = z.object({
  prompt: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const { id } = await params;
    const orgId = await requireOrgIdFromRequest();
    const body = BodySchema.parse(await req.json());
    const repo = await getOSRepositoryForRequest();

    const agent = await repo.agents.byId(orgId, id);
    if (!agent) return NextResponse.json({ error: 'agent_not_found' }, { status: 404 });

    const result = await runAndPersist(repo, agent, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'ZodError') {
      const ze = e as z.ZodError;
      return NextResponse.json({ error: 'invalid_input', details: ze.issues }, { status: 400 });
    }
    console.error('[POST /api/os/agents/:id/run]', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
