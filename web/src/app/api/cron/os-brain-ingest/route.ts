import { NextResponse } from 'next/server';
import { ingestForOrg } from '@/lib/os/brain/ingest';
import { createSupabaseRepository } from '@/lib/os/adapters/supabase';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { verifyCronAuth } from '@/lib/os/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/os-brain-ingest
 * Called by Vercel Cron every 6 hours (see vercel.json).
 * Requires Authorization: Bearer <CRON_SECRET>.
 *
 * Iterates over all org IDs in BRAIN_INGEST_ORG_IDS (comma-separated)
 * and runs ingestForOrg for each one using the service-role client.
 */
export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const orgIds = (process.env.BRAIN_INGEST_ORG_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (orgIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'BRAIN_INGEST_ORG_IDS not configured' },
      { status: 500 },
    );
  }

  const sb = getSupabaseServiceClient();
  const repo = createSupabaseRepository(sb);

  const results: Array<{ orgId: string; [k: string]: unknown }> = [];

  for (const orgId of orgIds) {
    try {
      const stats = await ingestForOrg(repo, orgId);
      results.push({ orgId, ...stats });
    } catch (e: any) {
      // Log error message without orgId to avoid tenant fingerprinting in log services
      console.error('[cron/os-brain-ingest] error=%s', e?.message ?? 'unknown');
      results.push({ orgId, error: 'ingest_failed' });
    }
  }

  return NextResponse.json({ ok: true, results });
}
