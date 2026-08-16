import { NextResponse } from 'next/server';
import { findDuePosts, publishPost } from '@/lib/os/broadcast/scheduler';
import { createSupabaseRepository } from '@/lib/os/adapters/supabase';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/os-broadcast-scheduler
 *
 * Called by Vercel Cron every minute (see vercel.json).
 * Protected by CRON_SECRET bearer token.
 *
 * Finds all cm_scheduled_posts with status='scheduled' whose
 * scheduled_date+time have passed, marks them published, and
 * logs activity. Sprint 5 will wire real platform dispatch.
 *
 * Env vars required:
 *   CRON_SECRET                  — shared secret, set in Vercel dashboard
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseServiceClient();
  const repo = createSupabaseRepository(sb);

  const due = await findDuePosts(undefined, 50);
  const results = [];
  for (const post of due) {
    const r = await publishPost(post, repo);
    results.push(r);
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
