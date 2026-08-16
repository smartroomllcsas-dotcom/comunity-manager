/**
 * ConnectorAdapter — base interface for all integration health probes.
 * Each adapter knows how to check whether a given org has that connector live.
 */

import type { ConnectorKind } from '@/lib/os/schemas/connector';

export type ProbeStatus = 'live' | 'configured' | 'not_configured' | 'error';

export interface ProbeResult {
  status: ProbeStatus;
  /** Extra context shown in the UI pill (e.g. page name, phone number) */
  meta?: Record<string, unknown>;
  error?: string;
}

export interface ConnectorAdapter {
  /** Stable identifier used as the connector `provider` field */
  id: string;
  /** Display name shown in the connections strip */
  label: string;
  kind: ConnectorKind;
  provider: string;
  /**
   * Probe whether the connector is live for `orgId`.
   * Must NEVER throw — return `{ status: 'error', error: ... }` instead.
   */
  probe(orgId: string): Promise<ProbeResult>;
}
