import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest, getOSRepositoryForRequest } from '@/lib/os/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { identify } from '@/lib/identify';

const ADMIN_EMAILS = new Set(['leonelzc2005@gmail.com', 'leonel.zc2005@gmail.com']);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const ent = await identify();
    if (!ent.userEmail || !ADMIN_EMAILS.has(ent.userEmail))
      return NextResponse.json({ error: 'admin only' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const parsed = z.object({ full_rollout: z.boolean() }).parse(body);
    const sb = getSupabaseServiceClient();

    await sb
      .from('os_cohorts')
      .update({ full_rollout: parsed.full_rollout, updated_at: new Date().toISOString() })
      .eq('id', id);

    // Log activity
    const orgId = await requireOrgIdFromRequest();
    const repo = await getOSRepositoryForRequest();
    await repo.activity.insert(orgId, {
      kind: 'cohort.toggle',
      actorId: ent.userId,
      summary: `${ent.userEmail} ${parsed.full_rollout ? 'ENABLED' : 'DISABLED'} full rollout for cohort ${id}`,
      payload: { cohortId: id, full_rollout: parsed.full_rollout },
      ok: true,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.name === 'ZodError') return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
