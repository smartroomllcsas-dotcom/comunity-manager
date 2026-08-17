/**
 * Connector registry — all adapters for the integrations board.
 * Import `probeAll` in Server Components to get honest status for every connector.
 */
import type { ConnectorAdapter, ProbeResult } from './base';

// CM channels (real data from smarttalk.channels)
import { metaAdapter } from './meta/adapter';
import { wahaAdapter } from './waha/adapter';
import { instagramAdapter } from './instagram/adapter';
import { cronAdapter } from './cron/adapter';
import { webhooksAdapter } from './webhooks/adapter';

// FounderOS stubs (env-based, os_connectors table)
import { slackAdapter } from './slack/adapter';
import { notionAdapter } from './notion/adapter';
import { stripeAdapter } from './stripe/adapter';
import { gmailImapAdapter } from './gmail-imap/adapter';
import { googleCalendarAdapter } from './google-calendar/adapter';

// Fusion 2026-08-17: 10 conectores adicionales portados de FounderOS-DEMO.
// Todos siguen el mismo contrato ConnectorAdapter, con probe() env-based y
// helpers exportados para consumo desde páginas específicas (Content, Funnel,
// Analytics, Brain, etc.).
import { zernioAdapter } from './zernio/adapter';
import { beehiivAdapter } from './beehiiv/adapter';
import { manychatAdapter } from './manychat/adapter';
import { attioAdapter } from './attio/adapter';
import { trakyoAdapter } from './trakyo/adapter';
import { webinarjamAdapter } from './webinarjam/adapter';
import { ghlAdapter } from './ghl/adapter';
import { metaAdsAdapter } from './meta-ads/adapter';
import { obsidianAdapter } from './obsidian/adapter';
import { llmAdapter } from './llm/adapter';

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
  // Fusion 2026-08-17 (grouped by domain)
  // — Social / Content
  zernioAdapter,
  beehiivAdapter,
  manychatAdapter,
  // — CRM / Funnel
  attioAdapter,
  trakyoAdapter,
  ghlAdapter,
  webinarjamAdapter,
  // — Ads / Analytics
  metaAdsAdapter,
  // — Intelligence
  obsidianAdapter,
  llmAdapter,
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
