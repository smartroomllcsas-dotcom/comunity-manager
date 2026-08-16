import { NextResponse } from 'next/server';
import { communityOsFlag } from '@/lib/flags';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { identify } from '@/lib/identify';

const ADMIN_EMAILS = new Set(['leonelzc2005@gmail.com', 'leonel.zc2005@gmail.com']);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const ent = await identify();
    if (!ent.userEmail || !ADMIN_EMAILS.has(ent.userEmail))
      return NextResponse.json({ error: 'admin only' }, { status: 403 });

    const { id } = await params;
    const sb = getSupabaseServiceClient();

    // Fetch cohort to get emails + org_ids counts
    const { data: cohort, error: cohortErr } = await sb
      .from('os_cohorts')
      .select('emails, org_ids, full_rollout')
      .eq('id', id)
      .maybeSingle();
    if (cohortErr) throw cohortErr;
    if (!cohort) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const usersCount = (cohort.emails ?? []).length;
    const orgsCount = (cohort.org_ids ?? []).length;

    // Activity in last 24h for this cohort
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: activityLast24h, error: actErr } = await sb
      .from('os_activity')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'cohort.toggle')
      .filter('payload->>cohortId', 'eq', id)
      .gte('at', since);
    if (actErr) throw actErr;

    return NextResponse.json({
      users_count: usersCount,
      orgs_count: orgsCount,
      full_rollout: cohort.full_rollout ?? false,
      activity_last_24h: activityLast24h ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
