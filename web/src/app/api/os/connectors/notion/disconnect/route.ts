import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { requireOrgIdFromRequest } from '@/lib/os/server';

export async function POST() {
  try {
    const orgId = await requireOrgIdFromRequest();
    const sb = getSupabaseServiceClient();

    await sb
      .from('os_connectors')
      .update({
        status: 'not_configured',
        config: {},
        last_check_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('id', 'notion');

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
