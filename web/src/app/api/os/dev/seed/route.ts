import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { getOSRepositoryForRequest, requireOrgIdFromRequest } from '@/lib/os/server';
import { seedDev } from '@/lib/os/seed-dev';

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'dev only' }, { status: 404 });
  }
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    await seedDev(repo, orgId);
    return NextResponse.json({ ok: true, message: 'seeded 1 agent + 3 goals' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
