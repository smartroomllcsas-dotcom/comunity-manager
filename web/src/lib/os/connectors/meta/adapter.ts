/**
 * Meta (Facebook / WhatsApp Business) connector.
 * Probes the CM `channels` table for an active webhook channel of type 'facebook'
 * or 'messenger'. No dedicated health-check helper found in CM codebase —
 * querying Supabase directly with service-role key (server-only).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConnectorAdapter, ProbeResult } from '../base';

export const metaAdapter: ConnectorAdapter = {
  id: 'meta-fb',
  label: 'Meta / Facebook',
  kind: 'webhook',
  provider: 'meta',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('channels')
        .select('id, name, status, type')
        .eq('organization_id', orgId)
        .in('type', ['facebook', 'messenger'])
        .limit(1)
        .maybeSingle();

      if (error) return { status: 'error', error: error.message };
      if (!data) return { status: 'not_configured', meta: { note: 'No Meta/Facebook channel found for this org' } };
      if (data.status === 'active') return { status: 'live', meta: { channelName: data.name, type: data.type } };
      if (data.status === 'pending') return { status: 'configured', meta: { channelName: data.name, channelStatus: data.status } };
      return { status: 'not_configured', meta: { channelName: data.name, channelStatus: data.status } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
