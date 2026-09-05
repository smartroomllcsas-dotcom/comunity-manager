import { NextResponse } from 'next/server';
import { runSentinel, buildContext } from '@/lib/os/goals/sentinel';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseRepository } from '@/lib/os/adapters/supabase';
import { verifyCronAuth } from '@/lib/os/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/os-goals-sentinel
 *
 * Called by Vercel Cron every 15 minutes (see vercel.json).
 * Protected by CRON_SECRET bearer token.
 *
 * Sprint 1: iterates orgs from LEONEL_ORG_IDS env var (comma-separated UUIDs).
 * Sprint 2 TODO: query orgs table for all orgs with community-os feature flag
 * instead of reading from env.
 *
 * Env vars required:
 *   CRON_SECRET         — shared secret, set in Vercel dashboard
 *   LEONEL_ORG_IDS      — comma-separated org UUIDs (Sprint 1 only)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
export async function GET(req: Request) {
  if (!verifyCronAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const orgIds = (process.env.LEONEL_ORG_IDS || '').split(',').filter(Boolean);
  if (orgIds.length === 0) {
    return NextResponse.json({ error: 'no orgs configured' }, { status: 500 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
  const repo = createSupabaseRepository(supabase);

  const results = [];
  for (const orgId of orgIds) {
    const ctx = await buildContext(orgId);
    const orgResults = await runSentinel(repo, orgId, ctx);
    results.push({ orgId, goals: orgResults });
  }

  return NextResponse.json({ ok: true, orgs: orgIds.length, results });
}
