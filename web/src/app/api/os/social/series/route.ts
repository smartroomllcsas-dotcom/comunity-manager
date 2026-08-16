import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';

/**
 * GET /api/os/social/series
 *
 * Returns follower time-series from cm_metrics_account for use in
 * the SocialStatStrip sparkline drawer.
 *
 * Query params:
 *   platform  — optional filter (instagram | facebook | tiktok | …)
 *   days      — lookback window in days (default: 30)
 *   metric    — ignored for now; always returns followers (future: engagement)
 *
 * Response:
 *   { series: Array<{ platform, snapshot_at, followers }> }
 *
 * Source tables:
 *   cm_metrics_account (organization_id, platform, snapshot_at, followers)
 */
export async function GET(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });

  try {
    const orgId = await requireOrgIdFromRequest();
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');
    const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? '30'), 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let query = sb
      .from('cm_metrics_account')
      .select('platform, snapshot_at, followers')
      .eq('organization_id', orgId)
      .gte('snapshot_at', since)
      .order('snapshot_at', { ascending: true });

    if (platform) query = query.eq('platform', platform);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ series: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    const status = msg.startsWith('unauthorized') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
