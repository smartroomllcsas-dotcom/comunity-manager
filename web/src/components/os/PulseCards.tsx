import type { Agent, Connector, Goal } from '@/lib/os/repository';

interface PulseCardsProps {
  agents: Agent[];
  connectors: Connector[];
  goals: Goal[];
  messagesToday?: number;
}

export function PulseCards({ agents, connectors, goals, messagesToday = 0 }: PulseCardsProps) {
  const liveConnectors = connectors.filter((c) => c.status === 'live').length;
  const totalConnectors = connectors.length;
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const okGoals = goals.filter((g) => g.lastStatus === 'ok').length;
  const breachGoals = goals.filter((g) => g.lastStatus === 'breach').length;
  const channelNames = connectors
    .filter((c) => c.status === 'live')
    .map((c) => c.provider.split(' ')[0])
    .slice(0, 7);

  return (
    <section className="pulse-grid" aria-label="Estado general">
      {/* Canales activos */}
      <div className="card">
        <div className="card-label">Canales activos</div>
        <div className="card-metric num">
          {liveConnectors}
          <span className="sep">/</span>
          <span className="small">{totalConnectors}</span>
        </div>
        <div className="chip-list">
          {channelNames.length > 0 ? (
            channelNames.map((name) => <span key={name}>{name}</span>)
          ) : (
            <span>sin canales en vivo</span>
          )}
        </div>
      </div>

      {/* Mensajes hoy */}
      <div className="card">
        <div className="card-label">Mensajes hoy</div>
        <div className="card-metric num">{messagesToday}</div>
        <div className="card-hint">
          {messagesToday > 0 ? 'entrantes + salientes' : 'sin mensajes todavía'}
        </div>
      </div>

      {/* Agentes activos */}
      <div className="card">
        <div className="card-label">Agentes activos</div>
        <div className="card-metric num">{activeAgents}</div>
        <div className="card-hint">
          {activeAgents > 0 ? `${activeAgents} en operación` : 'crea agentes en /os/agents'}
        </div>
      </div>

      {/* Standing goals */}
      <div className="card">
        <div className="card-label">Objetivos permanentes</div>
        <div className="card-metric num">
          <span style={{ color: 'var(--os-ok)' }}>{okGoals}</span>
          <span className="sep">/</span>
          <span style={{ color: 'var(--os-err)' }} className="small">
            {breachGoals}
          </span>
        </div>
        {breachGoals > 0 ? (
          <div className="card-hint err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            {breachGoals} en breach
          </div>
        ) : okGoals > 0 ? (
          <div className="card-hint ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Todos los goals en verde
          </div>
        ) : (
          <div className="card-hint">define objetivos en /os/goals</div>
        )}
      </div>
    </section>
  );
}
