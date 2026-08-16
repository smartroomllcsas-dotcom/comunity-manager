import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest, getOSRepositoryForRequest } from '@/lib/os/server';
import { ingestForOrg } from '@/lib/os/brain/ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/os/brain/ingest
 * Manual trigger: ingests CM data into the knowledge graph for the current org.
 * Returns { ok: true, stats } or { error: string }.
 */
export async function POST() {
  const enabled = await communityOsFlag();
  if (!enabled) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  try {
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    const stats = await ingestForOrg(repo, orgId);
    return NextResponse.json({ ok: true, stats });
  } catch (e: any) {
    console.error('[POST /api/os/brain/ingest]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
