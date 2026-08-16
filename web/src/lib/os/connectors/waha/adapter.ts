/**
 * WAHA / WhatsApp Business connector.
 * Probes CM `channels` table for type='whatsapp' channels.
 * No dedicated WAHA health-check helper found — using direct Supabase query.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConnectorAdapter, ProbeResult } from '../base';

export const wahaAdapter: ConnectorAdapter = {
  id: 'waha-whatsapp',
  label: 'WhatsApp (WAHA)',
  kind: 'webhook',
  provider: 'waha',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('channels')
        .select('id, name, status, whatsapp_phone_number_id')
        .eq('organization_id', orgId)
        .eq('type', 'whatsapp')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (error) return { status: 'error', error: error.message };
      if (!data) {
        // Check if there's a pending/disconnected channel
        const { data: anyChannel } = await admin
          .from('channels')
          .select('id, status')
          .eq('organization_id', orgId)
          .eq('type', 'whatsapp')
          .limit(1)
          .maybeSingle();
        if (anyChannel) return { status: 'configured', meta: { channelStatus: anyChannel.status } };
        return { status: 'not_configured', meta: { note: 'No WhatsApp channel found for this org' } };
      }
      return { status: 'live', meta: { channelName: data.name, phoneNumberId: data.whatsapp_phone_number_id } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
