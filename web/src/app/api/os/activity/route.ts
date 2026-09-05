import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';

const NewActivityBodySchema = z.object({
  kind: z.string(),
  actorId: z.string().nullable().optional(),
  at: z.string().datetime().optional(),
  summary: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  ok: z.boolean().nullable().optional(),
});

export async function GET(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const repo = await getOSRepositoryForRequest();
    const activity = await repo.activity.recent(orgId, limit);
    return NextResponse.json({ activity });
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
    const parsed = NewActivityBodySchema.parse(body);
    const repo = await getOSRepositoryForRequest();
    const inserted = await repo.activity.insert(orgId, parsed);
    return NextResponse.json({ ok: true, activity: inserted });
  } catch (e: any) {
    if (e.name === 'ZodError') return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
