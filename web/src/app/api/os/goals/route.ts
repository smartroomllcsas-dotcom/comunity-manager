import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { GoalSchema } from '@/lib/os/schemas/goal';

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    const goals = await repo.goals.all(orgId);
    return NextResponse.json({ goals });
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
    const parsed = GoalSchema.parse({ ...body, orgId });
    const repo = await getOSRepositoryForRequest();
    await repo.goals.upsert(orgId, parsed);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.name === 'ZodError') return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
