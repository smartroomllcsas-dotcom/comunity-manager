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
  const rows = agents.length > 0 ? agents.slice(0, 4) : PLACEHOLDER_AGENTS;

  const trustAvg =
    rows.length > 0
      ? (rows.reduce((s, a) => s + a.trustScore, 0) / rows.length).toFixed(2)
      : '0.82';

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Agent roster</div>
        <div className="panel-meta">trust avg {trustAvg}</div>
      </div>
      <div className="feed">
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

const PLACEHOLDER_AGENTS: Agent[] = [
  { id: '1', orgId: 'demo', departmentId: 'inbox', name: 'Auto-responder',  status: 'active', tier: 'worker',     model: 'sonnet', trustScore: 0.92, role: '', description: '', tools: [], instance: 'builtin', constitution: {}, trustLedger: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '2', orgId: 'demo', departmentId: 'inbox', name: 'Lead-qualifier',  status: 'active', tier: 'specialist', model: 'haiku',  trustScore: 0.88, role: '', description: '', tools: [], instance: 'builtin', constitution: {}, trustLedger: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '3', orgId: 'demo', departmentId: 'content', name: 'Content-writer', status: 'active', tier: 'worker',    model: 'opus',   trustScore: 0.76, role: '', description: '', tools: [], instance: 'builtin', constitution: {}, trustLedger: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '4', orgId: 'demo', departmentId: 'inbox', name: 'Escalator-agent', status: 'idle',   tier: 'worker',     model: 'haiku',  trustScore: 0.70, role: '', description: '', tools: [], instance: 'builtin', constitution: {}, trustLedger: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
