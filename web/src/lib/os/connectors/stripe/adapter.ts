/**
 * Stripe connector stub — FounderOS integration.
 * CM has billing via Stripe internally, but there's no per-org Stripe
 * connection surface yet. Returns not_configured until implemented.
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

export const stripeAdapter: ConnectorAdapter = {
  id: 'stripe',
  label: 'Stripe',
  kind: 'apikey',
  provider: 'stripe',

  async probe(_orgId: string): Promise<ProbeResult> {
    return {
      status: 'not_configured',
      meta: { note: 'Stripe per-org integration not yet implemented — FounderOS stub' },
    };
  },
};
