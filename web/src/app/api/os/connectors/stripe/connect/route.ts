import { NextResponse } from 'next/server';
import { z } from 'zod';
import { communityOsFlag } from '@/lib/flags';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import Stripe from 'stripe';

const BodySchema = z.object({
  apiKey: z.string().startsWith('rk_').or(z.string().startsWith('sk_')),
});

export async function POST(req: Request) {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const { apiKey } = BodySchema.parse(await req.json());
    // Verify key by making a lightweight call
    const stripe = new Stripe(apiKey, { apiVersion: '2024-06-20' as any });
    const acct = await stripe.accounts.retrieve();
    const sb = getSupabaseServiceClient();
    await sb.from('os_connectors').upsert(
      {
        id: 'stripe',
        org_id: orgId,
        kind: 'apikey',
        provider: 'stripe',
        status: 'live',
        config: {
          account_id: acct.id,
          business_name: (acct as any).business_profile?.name ?? null,
          // TODO: move api_key to Supabase Vault (Sprint 3)
          api_key: apiKey,
        },
        last_check_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,id' },
    );
    return NextResponse.json({ ok: true, accountId: acct.id });
  } catch (e: any) {
    if (e.name === 'ZodError')
      return NextResponse.json({ error: 'invalid_input', details: e.issues }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  const enabled = await communityOsFlag();
  if (!enabled) return NextResponse.json({ error: 'not_available' }, { status: 404 });
  try {
    const orgId = await requireOrgIdFromRequest();
    const sb = getSupabaseServiceClient();
    await sb
      .from('os_connectors')
      .update({ status: 'not_configured', config: {} })
      .eq('org_id', orgId)
      .eq('id', 'stripe');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
