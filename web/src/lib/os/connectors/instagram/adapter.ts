/**
 * Instagram Business connector.
 * Probes CM `channels` table for type='instagram' channels.
 * instagram.ts in CM provides OAuth helpers but no health-check — using direct query.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConnectorAdapter, ProbeResult } from '../base';

export const instagramAdapter: ConnectorAdapter = {
  id: 'instagram',
  label: 'Instagram',
  kind: 'oauth',
  provider: 'instagram',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('channels')
        .select('id, name, status, type')
        .eq('organization_id', orgId)
        .eq('type', 'instagram')
        .limit(1)
        .maybeSingle();

      if (error) return { status: 'error', error: error.message };
      if (!data) return { status: 'not_configured', meta: { note: 'No Instagram channel found for this org' } };
      if (data.status === 'active') return { status: 'live', meta: { channelName: data.name } };
      if (data.status === 'pending') return { status: 'configured', meta: { channelName: data.name, channelStatus: data.status } };
      return { status: 'not_configured', meta: { channelName: data.name, channelStatus: data.status } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
