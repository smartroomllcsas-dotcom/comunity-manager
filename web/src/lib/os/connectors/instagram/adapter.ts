/**
 * Instagram Business connector.
 * Probes CM `smarttalk.channels` for instagram channels across all brands
 * owned by the user. Filter by `brand_id` (cm_clients.id from identify()),
 * not `organization_id`.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveBrandIds } from '@/lib/os/scope';
import type { ConnectorAdapter, ProbeResult } from '../base';

const isRealChannel = (config: unknown): boolean => {
  const c = (config ?? {}) as Record<string, unknown>;
  return !c.qa_seed && !c.synthetic && !c.non_operational;
};

export const instagramAdapter: ConnectorAdapter = {
  id: 'instagram',
  label: 'Instagram',
  kind: 'oauth',
  provider: 'instagram',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const brandIds = await resolveBrandIds(orgId);
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('channels')
        .select('id, name, status, config, meta_business_id')
        .in('brand_id', brandIds)
        .eq('type', 'instagram');

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
      return { status: 'not_configured', meta: { note: 'No Instagram channel found' } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
