/**
 * WhatsApp connector (WAHA + Business Cloud APIs).
 * Probes CM `smarttalk.channels` across all brands owned by the user.
 * Filter by `brand_id` (cm_clients.id from identify()), not `organization_id`.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveBrandIds } from '@/lib/os/scope';
import type { ConnectorAdapter, ProbeResult } from '../base';

const WHATSAPP_TYPES = ['waha', 'whatsapp_business_api', 'whatsapp_cloud_api'];

const isRealChannel = (config: unknown): boolean => {
  const c = (config ?? {}) as Record<string, unknown>;
  return !c.qa_seed && !c.synthetic && !c.non_operational;
};

export const wahaAdapter: ConnectorAdapter = {
  id: 'waha-whatsapp',
  label: 'WhatsApp',
  kind: 'webhook',
  provider: 'waha',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const brandIds = await resolveBrandIds(orgId);
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('channels')
        .select('id, name, status, type, config, whatsapp_phone_number_id')
        .in('brand_id', brandIds)
        .in('type', WHATSAPP_TYPES);

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
            phoneNumberId: first.whatsapp_phone_number_id ?? null,
            type: first.type,
          },
        };
      }
      if (real.length > 0) {
        return { status: 'configured', meta: { channelStatus: real[0].status } };
      }
      return { status: 'not_configured', meta: { note: 'No WhatsApp channel found' } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
