/**
 * Cal.com connector — self-hosted at cal.smartgenapp.com.
 *
 * IMPORTANT: The `calcom/cal.com` docker image ships ONLY the web app —
 * the REST API service (`apps/api/v1`, `apps/api/v2`) must be deployed
 * separately. Until that happens, we probe the app's public booking page
 * (which requires no authentication) to verify the instance is reachable.
 *
 * Config in os_connectors.config:
 *   {
 *     base_url:    'https://cal.smartgenapp.com',   // instance URL
 *     username:    'leonel',                         // Cal.com username → booking path
 *     api_key?:    wrapSecret('cal_XXXX'),           // for future API v1/v2 use
 *     admin_email?: 'leonel@smartgenapp.com'         // for reference in UI
 *   }
 *
 * Status semantics:
 *   - not_configured: no username/base_url
 *   - configured:     config present, HEAD probe failed (temporary)
 *   - live:           booking page returns 200 or 3xx
 *   - error:          unexpected exception
 */
import type { ConnectorAdapter, ProbeResult } from '../base';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';

const DEFAULT_BASE_URL =
  process.env.CALCOM_BASE_URL?.trim() || 'https://cal.smartgenapp.com';

export const calcomAdapter: ConnectorAdapter = {
  id: 'calcom',
  label: 'Cal.com',
  kind: 'apikey',
  provider: 'calcom',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const sb = getSupabaseServiceClient();
      const { data } = await sb
        .from('os_connectors')
        .select('config, status')
        .eq('org_id', orgId)
        .eq('id', 'calcom')
        .maybeSingle();

      const cfg = (data?.config ?? {}) as Record<string, unknown>;
      const username = (cfg.username as string | undefined)?.trim();
      const baseUrl = (cfg.base_url as string | undefined)?.trim() || DEFAULT_BASE_URL;

      if (!username) {
        return {
          status: 'not_configured',
          meta: { note: 'Add Cal.com username in os_connectors.config.username' },
        };
      }

      const bookingUrl = `${baseUrl}/${username}`;

      const res = await fetch(bookingUrl, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });

      const ok = res.status === 200 || (res.status >= 300 && res.status < 400);
      if (!ok) {
        return {
          status: 'configured',
          meta: {
            username,
            baseUrl,
            bookingUrl,
            note: `Booking page returned ${res.status} — verify username exists in Cal.com`,
          },
        };
      }

      return {
        status: 'live',
        meta: {
          username,
          baseUrl,
          bookingUrl,
          adminEmail: (cfg.admin_email as string | undefined) ?? null,
          hasApiKey: Boolean(cfg.api_key),
          note: null,
        },
      };
    } catch (e: any) {
      return {
        status: 'error',
        error: e?.message ?? String(e),
        meta: { note: 'Cal.com unreachable — verify tunnel is up' },
      };
    }
  },
};
