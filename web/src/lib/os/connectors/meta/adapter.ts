/**
 * Meta (Facebook Messenger) connector.
 * Probes CM `smarttalk.channels` for facebook_messenger channels across all
 * brands owned by the user. `orgId` from identify() is a `cm_clients.id`, so
 * we filter by `brand_id` (not `organization_id`, which is the smarttalk org).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveBrandIds } from '@/lib/os/scope';
import type { ConnectorAdapter, ProbeResult } from '../base';

const isRealChannel = (config: unknown): boolean => {
  const c = (config ?? {}) as Record<string, unknown>;
  return !c.qa_seed && !c.synthetic && !c.non_operational;
};

export const metaAdapter: ConnectorAdapter = {
  id: 'meta-fb',
  label: 'Meta / Facebook',
  kind: 'webhook',
  provider: 'meta',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const brandIds = await resolveBrandIds(orgId);
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('channels')
        .select('id, name, status, type, config, meta_business_id')
        .in('brand_id', brandIds)
        .eq('type', 'facebook_messenger');

      if (error) return { status: 'error', error: error.message };
      const real = (data ?? []).filter((c) => isRealChannel(c.config));
      const active = real.filter((c) => c.status === 'active');
      if (active.length > 0) {
        const first = active[0];
        return {
          status: 'live',
          meta: {
            channelName: first.name,
            channelCount: active.length,
            metaBusinessId: first.meta_business_id ?? null,
          },
        };
      }
      if (real.length > 0) {
        return { status: 'configured', meta: { channelName: real[0].name, channelStatus: real[0].status } };
      }
      return { status: 'not_configured', meta: { note: 'No Facebook Messenger channel found' } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
