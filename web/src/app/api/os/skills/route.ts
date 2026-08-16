import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { SkillSchema } from '@/lib/os/schemas/skill';

export async function GET() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    const skills = await repo.skills.all(orgId);
    return NextResponse.json({ skills });
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
    const parsed = SkillSchema.parse({ ...body, orgId });
    const repo = await getOSRepositoryForRequest();
    await repo.skills.upsert(orgId, parsed);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.name === 'ZodError') return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
