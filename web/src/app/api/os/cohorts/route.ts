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

// GET /api/os/cohorts — list all cohorts
export async function GET() {
  try {
    await requireAdmin();
    const sb = getSupabaseServiceClient();
    const { data, error } = await sb
      .from('os_cohorts')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ cohorts: data });
  } catch (e: any) {
    const status = e.message === 'forbidden' ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}

// POST /api/os/cohorts — create or replace a cohort
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { id, label, description, full_rollout, emails, org_ids } = body;
    if (!id || !label) {
      return NextResponse.json({ error: 'id and label are required' }, { status: 400 });
    }
    const sb = getSupabaseServiceClient();
    const { error } = await sb.from('os_cohorts').upsert({
      id,
      label,
      description: description ?? '',
      full_rollout: full_rollout ?? false,
      emails: emails ?? [],
      org_ids: org_ids ?? [],
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === 'forbidden' ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
