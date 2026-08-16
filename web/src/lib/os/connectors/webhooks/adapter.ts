/**
 * Meta Webhooks connector.
 * Checks how many active webhook-type channels exist for the org.
 * Considers the org as `live` if META_WEBHOOK_VERIFY_TOKEN is set
 * and there's at least one active channel of any webhook type.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConnectorAdapter, ProbeResult } from '../base';

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

      const admin = createAdminClient();
      const { data, error, count } = await admin
        .from('channels')
        .select('id, type, status', { count: 'exact' })
        .eq('organization_id', orgId)
        .in('type', ['whatsapp', 'facebook', 'messenger', 'instagram'])
        .eq('status', 'active');

      if (error) return { status: 'error', error: error.message };
      const activeCount = count ?? data?.length ?? 0;
      if (activeCount === 0) return { status: 'configured', meta: { note: 'Webhook token set but no active channels', activeEndpoints: 0 } };
      return { status: 'live', meta: { activeEndpoints: activeCount } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
