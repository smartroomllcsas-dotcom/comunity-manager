import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';

const NewAgentRunBodySchema = z.object({
  id: z.string(),
  orgId: z.string().uuid().optional(),
  agentId: z.string(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().optional(),
  ok: z.boolean().nullable().optional(),
  summary: z.string().optional(),
  input: z.unknown().nullable().optional(),
  output: z.unknown().nullable().optional(),
  tokensIn: z.number().int().nullable().optional(),
  tokensOut: z.number().int().nullable().optional(),
  costUsd: z.number().nullable().optional(),
});

export async function GET(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const repo = await getOSRepositoryForRequest();
    const agentRuns = await repo.agentRuns.recent(orgId, limit);
    return NextResponse.json({ agentRuns });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const body = await req.json();
    const parsed = NewAgentRunBodySchema.parse(body);
    const repo = await getOSRepositoryForRequest();
    const inserted = await repo.agentRuns.insert(orgId, { ...parsed, orgId });
    return NextResponse.json({ ok: true, agentRun: inserted });
  } catch (e: any) {
    if (e.name === 'ZodError') return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
