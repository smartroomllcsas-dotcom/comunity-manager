/**
 * Notion connector stub — FounderOS integration, not yet configured in CM.
 * Returns not_configured until a Notion OAuth flow is implemented.
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

export const notionAdapter: ConnectorAdapter = {
  id: 'notion',
  label: 'Notion',
  kind: 'oauth',
  provider: 'notion',

  async probe(_orgId: string): Promise<ProbeResult> {
    return {
      status: 'not_configured',
      meta: { note: 'Notion integration not yet implemented — FounderOS stub' },
    };
  },
};
