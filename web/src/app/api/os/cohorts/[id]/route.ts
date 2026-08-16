import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { identify } from '@/lib/identify';

// Sprint 3: hardcoded admin whitelist; Sprint 4 moves to role-based.
const ADMIN_EMAILS = new Set(['leonelzc2005@gmail.com', 'leonel.zc2005@gmail.com']);

async function requireAdmin(): Promise<string> {
  const entities = await identify();
  const email = entities.userEmail ?? '';
  if (!ADMIN_EMAILS.has(email)) throw new Error('forbidden');
  return email;
}

// PATCH /api/os/cohorts/[id] — add email, add org, toggle full_rollout, remove email/org
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    // body may contain: { add_email?, remove_email?, add_org?, remove_org?, full_rollout? }
    const sb = getSupabaseServiceClient();

    // Fetch current row
    const { data: current, error: fetchErr } = await sb
      .from('os_cohorts')
      .select('emails, org_ids, full_rollout')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    let emails: string[] = current.emails ?? [];
    let orgIds: string[] = current.org_ids ?? [];
    let fullRollout: boolean = current.full_rollout ?? false;

    if (body.add_email && !emails.includes(body.add_email)) {
      emails = [...emails, body.add_email];
    }
    if (body.remove_email) {
      emails = emails.filter((e) => e !== body.remove_email);
    }
    if (body.add_org && !orgIds.includes(body.add_org)) {
      orgIds = [...orgIds, body.add_org];
    }
    if (body.remove_org) {
      orgIds = orgIds.filter((o) => o !== body.remove_org);
    }
    if (typeof body.full_rollout === 'boolean') {
      fullRollout = body.full_rollout;
    }

    const { error: updateErr } = await sb
      .from('os_cohorts')
      .update({ emails, org_ids: orgIds, full_rollout: fullRollout, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true, emails, org_ids: orgIds, full_rollout: fullRollout });
  } catch (e: any) {
    const status = e.message === 'forbidden' ? 403 : e.message === 'not_found' ? 404 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}

// DELETE /api/os/cohorts/[id] — delete a cohort
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const sb = getSupabaseServiceClient();
    const { error } = await sb.from('os_cohorts').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === 'forbidden' ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
