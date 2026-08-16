import type { Connector } from '@/lib/os/repository';
import type { ConnectorStatus } from '@/lib/os/schemas/connector';

interface ConnectionsStripProps {
  connectors: Connector[];
}

function statusClass(status: ConnectorStatus): string {
  if (status === 'live') return 'st-live';
  if (status === 'configured') return 'st-conf';
  if (status === 'error') return 'st-err';
  return 'st-nc';
}

function statusLabel(status: ConnectorStatus): string {
  if (status === 'live') return 'Live';
  if (status === 'configured') return 'Configured';
  if (status === 'error') return 'Error';
  return 'Not conf.';
}

export function ConnectionsStrip({ connectors }: ConnectionsStripProps) {
  const rows = connectors.length > 0 ? connectors : PLACEHOLDER_CONNECTORS;

  const live = rows.filter((c) => c.status === 'live').length;
  const configured = rows.filter((c) => c.status === 'configured').length;
  const notConf = rows.filter((c) => c.status === 'not_configured').length;

  return (
    <section className="connections">
      <div className="connections-head">
        <div className="panel-title">Conexiones · honest status</div>
        <div className="connections-meta">
          <span><strong>{live}</strong> live</span>
          <span><strong>{configured}</strong> configured</span>
          <span><strong>{notConf}</strong> not configured</span>
        </div>
      </div>
      <div className="conn-grid">
        {rows.map((conn) => {
          const displayName = conn.provider || conn.id;
          const abbr = displayName.charAt(0).toUpperCase();
          const meta = conn.lastError ?? (conn.status === 'not_configured' ? 'connect →' : '');

          return (
            <div key={conn.id} className="conn">
              <div className="conn-head">
                <div className="conn-logo">{abbr}</div>
                <div className="conn-name">{displayName}</div>
              </div>
              <span className={`conn-status ${statusClass(conn.status)}`}>
                {statusLabel(conn.status)}
              </span>
              {meta && <div className="conn-meta">{meta}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const PLACEHOLDER_CONNECTORS: Connector[] = [
  { id: '1',  orgId: 'demo', kind: 'oauth',   provider: 'Meta FB',    status: 'live',           config: {} },
  { id: '2',  orgId: 'demo', kind: 'oauth',   provider: 'Instagram',  status: 'live',           config: {} },
  { id: '3',  orgId: 'demo', kind: 'oauth',   provider: 'WhatsApp',   status: 'live',           config: {} },
  { id: '4',  orgId: 'demo', kind: 'apikey',  provider: 'WAHA',       status: 'live',           config: {} },
  { id: '5',  orgId: 'demo', kind: 'oauth',   provider: 'Slack',      status: 'configured',     config: {} },
  { id: '6',  orgId: 'demo', kind: 'oauth',   provider: 'Notion',     status: 'not_configured', config: {} },
  { id: '7',  orgId: 'demo', kind: 'apikey',  provider: 'Stripe',     status: 'not_configured', config: {} },
  { id: '8',  orgId: 'demo', kind: 'imap',    provider: 'Gmail IMAP', status: 'not_configured', config: {} },
  { id: '9',  orgId: 'demo', kind: 'apikey',  provider: 'ePayco',     status: 'live',           config: {} },
  { id: '10', orgId: 'demo', kind: 'cron',    provider: 'Cron',       status: 'live',           config: {} },
  { id: '11', orgId: 'demo', kind: 'webhook', provider: 'Webhooks',   status: 'live',           config: {} },
  { id: '12', orgId: 'demo', kind: 'oauth',   provider: 'Calendar',   status: 'configured',     config: {} },
];
