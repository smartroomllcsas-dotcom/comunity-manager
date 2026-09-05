/**
 * Meta Webhooks connector.
 * Counts real active webhook-type channels across all brands owned by the user.
 * `live` when META_WEBHOOK_VERIFY_TOKEN is set AND there is ≥1 non-synthetic
 * active channel bound to any of the user's brands.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveBrandIds } from '@/lib/os/scope';
import type { ConnectorAdapter, ProbeResult } from '../base';

const WEBHOOK_TYPES = [
  'waha',
  'whatsapp_business_api',
  'whatsapp_cloud_api',
  'facebook_messenger',
  'instagram',
];

const isRealChannel = (config: unknown): boolean => {
  const c = (config ?? {}) as Record<string, unknown>;
  return !c.qa_seed && !c.synthetic && !c.non_operational;
};

export const webhooksAdapter: ConnectorAdapter = {
  id: 'meta-webhooks',
  label: 'Meta Webhooks',
  kind: 'webhook',
  provider: 'meta-webhooks',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const hasVerifyToken = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN);
      if (!hasVerifyToken) {
        return { status: 'not_configured', meta: { note: 'META_WEBHOOK_VERIFY_TOKEN not set' } };
      }

      const brandIds = await resolveBrandIds(orgId);
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('channels')
        .select('id, type, status, config')
        .in('brand_id', brandIds)
        .in('type', WEBHOOK_TYPES)
        .eq('status', 'active');

      if (error) return { status: 'error', error: error.message };
      const real = (data ?? []).filter((c) => isRealChannel(c.config));
      const activeCount = real.length;
      if (activeCount === 0) {
        return {
          status: 'configured',
          meta: { note: 'Webhook token set but no active channels', activeEndpoints: 0 },
        };
      }
      return { status: 'live', meta: { activeEndpoints: activeCount } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
