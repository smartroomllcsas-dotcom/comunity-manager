import { z } from 'zod';

const CONNECTOR_KINDS = ['webhook', 'oauth', 'apikey', 'imap', 'cron'] as const;
const CONNECTOR_STATUSES = ['not_configured', 'configured', 'live', 'error'] as const;

export const ConnectorKind = z.enum(CONNECTOR_KINDS);
export type ConnectorKind = z.infer<typeof ConnectorKind>;
export const ConnectorStatus = z.enum(CONNECTOR_STATUSES);
export type ConnectorStatus = z.infer<typeof ConnectorStatus>;

export const ConnectorSchema = z.object({
  id: z.string(),
  orgId: z.string().uuid(),
  kind: ConnectorKind,
  provider: z.string(),
  status: ConnectorStatus,
  lastCheckAt: z.string().datetime().nullable().optional(),
  lastError: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  secretRef: z.string().nullable().optional(),
});

export type Connector = z.infer<typeof ConnectorSchema>;
export type NewConnector = Connector;
