import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { identify } from '@/lib/identify';
import Stripe from 'stripe';
import { wrapSecret } from '@/lib/os/crypto';

const BodySchema = z.object({
  apiKey: z.string().startsWith('rk_').or(z.string().startsWith('sk_')),
});

/**
 * Verifies the current session user is an admin of the org they are trying to
 * write connector secrets for. Required because getSupabaseServiceClient()
 * bypasses RLS — we must enforce authorization at the application layer.
 */
async function requireOrgAdmin(orgId: string): Promise<void> {
  const ent = await identify();
  if (!ent?.userId) throw new Error('unauthorized');
  const sb = getSupabaseServiceClient();
  const { data } = await sb
    .from('cm_users')
    .select('id, role, cm_client_id')
    .eq('id', ent.userId)
    .eq('cm_client_id', orgId)
    .maybeSingle();
  if (!data) throw new Error('forbidden');
  const role = (data as { role?: string | null }).role;
  if (role && !['admin', 'owner'].includes(role)) throw new Error('forbidden');
}

export async function POST(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    await requireOrgAdmin(orgId);
    const { apiKey } = BodySchema.parse(await req.json());
    // Verify key by making a lightweight call
    const stripe = new Stripe(apiKey, { apiVersion: '2024-06-20' as any });
    const acct = await stripe.accounts.retrieve();
    const sb = getSupabaseServiceClient();
    const { error: upsertError } = await sb.from('os_connectors').upsert(
      {
        id: 'stripe',
        org_id: orgId,
        kind: 'apikey',
        provider: 'stripe',
        status: 'live',
        config: {
          account_id: acct.id,
          business_name: (acct as any).business_profile?.name ?? null,
          api_key: wrapSecret(apiKey),
        },
        last_check_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,id' },
    );
    if (upsertError) throw new Error('db_upsert_failed');
    return NextResponse.json({ ok: true, accountId: acct.id });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.name === 'ZodError') {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    if (err.message === 'forbidden' || err.message === 'unauthorized') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    // Log internally; do NOT expose Stripe SDK error messages (may contain key hints)
    console.error('[stripe.connect] failed:', err.message);
    return NextResponse.json({ error: 'connector_failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    await requireOrgAdmin(orgId);
    const sb = getSupabaseServiceClient();
    const { error } = await sb
      .from('os_connectors')
      .update({ status: 'not_configured', config: {} })
      .eq('org_id', orgId)
      .eq('id', 'stripe');
    if (error) throw new Error('db_delete_failed');
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.message === 'forbidden' || err.message === 'unauthorized') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[stripe.disconnect] failed:', err.message);
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 });
  }
}
