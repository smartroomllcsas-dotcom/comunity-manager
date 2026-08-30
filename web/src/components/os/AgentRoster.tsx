import type { Agent } from '@/lib/os/repository';

interface AgentRosterProps {
  agents: Agent[];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AgentRoster({ agents }: AgentRosterProps) {
  const rows = agents.slice(0, 4);

  const trustAvg =
    rows.length > 0
      ? (rows.reduce((s, a) => s + a.trustScore, 0) / rows.length).toFixed(2)
      : '—';

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Agent roster</div>
        <div className="panel-meta">trust avg {trustAvg}</div>
      </div>
      <div className="feed">
        {rows.length === 0 && (
          <div className="feed-row">
            <div className="feed-body">
              <div className="feed-line">Sin agentes configurados</div>
              <div className="feed-meta">crea tu primer agente en /os/agents</div>
            </div>
          </div>
        )}
        {rows.map((agent) => {
          const trust = agent.trustScore;
          const isActive = agent.status === 'active';
          const abbr = initials(agent.name);

          return (
            <div key={agent.id} className="feed-row agent-row">
              <div className="agent-avatar">{abbr}</div>
              <div className="feed-body">
                <div className="agent-name">{agent.name}</div>
                <div className="agent-model">{agent.model || 'sonnet'}</div>
                <div className="trust">
                  <div className="trust-bar">
                    <div style={{ width: `${trust * 100}%` }} />
                  </div>
                  <span className="trust-value num">{trust.toFixed(2)}</span>
                </div>
              </div>
              <div className={`agent-status ${isActive ? 'on' : 'idle'}`}>
                {isActive ? 'Live' : 'Idle'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
