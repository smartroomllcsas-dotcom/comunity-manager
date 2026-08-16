import { Client } from '@notionhq/client';
import type { ConnectorAdapter, ProbeResult } from '../base';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';

export const notionAdapter: ConnectorAdapter = {
  id: 'notion',
  label: 'Notion',
  kind: 'oauth',
  provider: 'notion',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const sb = getSupabaseServiceClient();
      const { data } = await sb
        .from('os_connectors')
        .select('config, status')
        .eq('org_id', orgId)
        .eq('id', 'notion')
        .maybeSingle();

      if (!data || !(data.config as any)?.access_token) {
        return { status: 'not_configured' };
      }

      const notion = new Client({ auth: (data.config as any).access_token });
      const me = await notion.users.me({});

      return {
        status: 'live',
        meta: {
          workspaceName: (data.config as any).workspace_name,
          botName: (me as any).name ?? null,
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
