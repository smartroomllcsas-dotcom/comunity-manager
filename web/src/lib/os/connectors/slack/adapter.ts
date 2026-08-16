/**
 * Slack connector stub — FounderOS integration, not yet configured in CM.
 * Returns not_configured until a Slack OAuth flow is implemented.
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

export const slackAdapter: ConnectorAdapter = {
  id: 'slack',
  label: 'Slack',
  kind: 'oauth',
  provider: 'slack',

  async probe(_orgId: string): Promise<ProbeResult> {
    return {
      status: 'not_configured',
      meta: { note: 'Slack integration not yet implemented — FounderOS stub' },
    };
  },
};
