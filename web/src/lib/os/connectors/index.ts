/**
 * Connector registry — all adapters for the integrations board.
 * Import `probeAll` in Server Components to get honest status for every connector.
 */
import type { ConnectorAdapter, ProbeResult } from './base';

// CM wrappers
import { metaAdapter } from './meta/adapter';
import { wahaAdapter } from './waha/adapter';
import { instagramAdapter } from './instagram/adapter';
import { cronAdapter } from './cron/adapter';
import { webhooksAdapter } from './webhooks/adapter';

// FounderOS stubs
import { slackAdapter } from './slack/adapter';
import { notionAdapter } from './notion/adapter';
import { stripeAdapter } from './stripe/adapter';
import { gmailImapAdapter } from './gmail-imap/adapter';
import { googleCalendarAdapter } from './google-calendar/adapter';

export type { ConnectorAdapter, ProbeResult };

export const connectorRegistry: ConnectorAdapter[] = [
  // CM channels (probe real data)
  metaAdapter,
  wahaAdapter,
  instagramAdapter,
  cronAdapter,
  webhooksAdapter,
  // FounderOS stubs (not_configured until implemented)
  slackAdapter,
  notionAdapter,
  stripeAdapter,
  gmailImapAdapter,
  googleCalendarAdapter,
];

export interface ProbeEntry {
  adapter: ConnectorAdapter;
  result: ProbeResult;
}

/**
 * Run all probes in parallel. Never throws.
 */
export async function probeAll(orgId: string): Promise<ProbeEntry[]> {
  const results = await Promise.allSettled(
    connectorRegistry.map((adapter) => adapter.probe(orgId))
  );

  return connectorRegistry.map((adapter, i) => {
    const settled = results[i];
    const result: ProbeResult =
      settled.status === 'fulfilled'
        ? settled.value
        : { status: 'error', error: String((settled as PromiseRejectedResult).reason) };
    return { adapter, result };
  });
}
