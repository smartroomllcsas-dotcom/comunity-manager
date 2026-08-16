/**
 * Vercel Cron connector.
 * Reports `live` if CRON_SECRET is configured (the sentinel of all cron routes),
 * otherwise `not_configured`. orgId is unused — cron is infrastructure-level.
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

export const cronAdapter: ConnectorAdapter = {
  id: 'vercel-cron',
  label: 'Vercel Cron',
  kind: 'cron',
  provider: 'vercel',

  async probe(_orgId: string): Promise<ProbeResult> {
    try {
      const hasSecret = Boolean(process.env.CRON_SECRET);
      if (!hasSecret) {
        return { status: 'not_configured', meta: { note: 'CRON_SECRET env var not set' } };
      }
      return { status: 'live', meta: { routes: ['billing-lifecycle', 'billing-outbox', 'billing-webhook-recovery', 'rate-limit-purge', 'reap-scheduled', 'refresh-tokens', 'release-contact-overage'] } };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  },
};
