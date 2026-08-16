/**
 * Gmail / IMAP connector stub — FounderOS integration.
 * Returns not_configured until IMAP credentials flow is implemented.
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

export const gmailImapAdapter: ConnectorAdapter = {
  id: 'gmail-imap',
  label: 'Gmail / IMAP',
  kind: 'imap',
  provider: 'gmail-imap',

  async probe(_orgId: string): Promise<ProbeResult> {
    return {
      status: 'not_configured',
      meta: { note: 'Gmail/IMAP integration not yet implemented — FounderOS stub' },
    };
  },
};
