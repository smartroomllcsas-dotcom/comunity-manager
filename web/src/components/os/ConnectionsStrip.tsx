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
  if (status === 'live') return 'Activo';
  if (status === 'configured') return 'Configurado';
  if (status === 'error') return 'Error';
  return 'Sin configurar';
}

export function ConnectionsStrip({ connectors }: ConnectionsStripProps) {
  const rows = connectors;

  const live = rows.filter((c) => c.status === 'live').length;
  const configured = rows.filter((c) => c.status === 'configured').length;
  const notConf = rows.filter((c) => c.status === 'not_configured').length;

  return (
    <section className="connections">
      <div className="connections-head">
        <div className="panel-title">Conexiones · estado real</div>
        <div className="connections-meta">
          <span><strong>{live}</strong> activas</span>
          <span><strong>{configured}</strong> configuradas</span>
          <span><strong>{notConf}</strong> sin configurar</span>
        </div>
      </div>
      <div className="conn-grid">
        {rows.length === 0 && (
          <div className="conn">
            <div className="conn-head">
              <div className="conn-name">Sin canales conectados</div>
            </div>
            <div className="conn-meta">conecta tu primer canal en /os/integrations</div>
          </div>
        )}
        {rows.map((conn) => {
          const displayName = conn.provider || conn.id;
          const abbr = displayName.charAt(0).toUpperCase();
          const meta = conn.lastError ?? (conn.status === 'not_configured' ? 'conectar →' : '');

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
