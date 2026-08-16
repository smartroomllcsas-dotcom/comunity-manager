/**
 * Stripe connector — API key (restricted key) wire.
 * Key is stored in os_connectors.config.api_key.
 * TODO Sprint 3: move api_key to Supabase Vault.
 */
import Stripe from 'stripe';
import type { ConnectorAdapter, ProbeResult } from '../base';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';

export const stripeAdapter: ConnectorAdapter = {
  id: 'stripe',
  label: 'Stripe',
  kind: 'apikey',
  provider: 'stripe',

  async probe(orgId: string): Promise<ProbeResult> {
    const sb = getSupabaseServiceClient();
    const { data } = await sb
      .from('os_connectors')
      .select('config')
      .eq('org_id', orgId)
      .eq('id', 'stripe')
      .maybeSingle();
    const cfg = (data?.config ?? {}) as any;
    if (!cfg.api_key) return { status: 'not_configured' };
    try {
      const stripe = new Stripe(cfg.api_key, { apiVersion: '2024-06-20' as any });
      const acct = await stripe.accounts.retrieve();
      return {
        status: 'live',
        meta: {
          accountId: acct.id,
          businessName: cfg.business_name ?? null,
          note: null,
        },
      };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  },
};
