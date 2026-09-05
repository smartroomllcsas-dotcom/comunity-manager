/**
 * Slack connector adapter — FounderOS integration.
 * Probes whether the org has a valid Slack OAuth token by calling auth.test.
 */
import { WebClient } from '@slack/web-api';
import type { ConnectorAdapter, ProbeResult } from '../base';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { unwrapSecret } from '@/lib/os/crypto';

export const slackAdapter: ConnectorAdapter = {
  id: 'slack',
  label: 'Slack',
  kind: 'oauth',
  provider: 'slack',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const sb = getSupabaseServiceClient();
      const { data } = await sb
        .from('os_connectors')
        .select('config, status')
        .eq('org_id', orgId)
        .eq('id', 'slack')
        .maybeSingle();

      const rawToken = (data?.config as any)?.access_token as string | undefined;
      if (!rawToken) return { status: 'not_configured' };
      const accessToken = unwrapSecret(rawToken);
      if (!accessToken) return { status: 'not_configured' };

      const client = new WebClient(accessToken);
      const auth = await client.auth.test();

      return {
        status: 'live',
        meta: {
          team: (auth as any).team ?? null,
          user: (auth as any).user ?? null,
          team_id: (auth as any).team_id ?? null,
          note: null,
        },
      };
    } catch (e: any) {
      return {
        status: 'error',
        error: e.message,
        meta: { note: 'token invalid — reconnect' },
      };
    }
  },
};
