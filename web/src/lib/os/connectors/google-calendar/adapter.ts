/**
 * Google Calendar connector stub — FounderOS integration.
 * Returns not_configured until Google OAuth calendar scope is implemented.
 */
import type { ConnectorAdapter, ProbeResult } from '../base';

export const googleCalendarAdapter: ConnectorAdapter = {
  id: 'google-calendar',
  label: 'Google Calendar',
  kind: 'oauth',
  provider: 'google-calendar',

  async probe(_orgId: string): Promise<ProbeResult> {
    return {
      status: 'not_configured',
      meta: { note: 'Google Calendar integration not yet implemented — FounderOS stub' },
    };
  },
};
