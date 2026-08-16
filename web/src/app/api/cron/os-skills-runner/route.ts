import { NextResponse } from 'next/server';
import { runDueSkills } from '@/lib/os/skills/runner';
import { createSupabaseRepository } from '@/lib/os/adapters/supabase';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { verifyCronAuth } from '@/lib/os/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/os-skills-runner
 * Called by Vercel Cron every 5 minutes (see vercel.json).
 * Requires Authorization: Bearer <CRON_SECRET>.
 *
 * Evaluates each org's skills against their cron schedule and fires
 * any that are due. Results are written to the activity feed (kind=skill.run).
 */
export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const orgIds = (process.env.LEONEL_ORG_IDS || '').split(',').filter(Boolean);
  const sb = getSupabaseServiceClient();
  const repo = createSupabaseRepository(sb);

  const results = [];
  for (const orgId of orgIds) {
    try {
      results.push({ orgId, skills: await runDueSkills(repo, orgId) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ orgId, error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
