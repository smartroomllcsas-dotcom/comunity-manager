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
          <span className="small">{totalConnectors || 7}</span>
        </div>
        <div className="chip-list">
          {channelNames.length > 0
            ? channelNames.map((name) => <span key={name}>{name}</span>)
            : ['Meta', 'IG', 'WA', 'WAHA', 'Slack', 'Email', 'Web'].map((n) => (
                <span key={n}>{n}</span>
              ))}
        </div>
      </div>

      {/* Mensajes hoy */}
      <div className="card">
        <div className="card-label">Mensajes hoy</div>
        <div className="card-metric num">{messagesToday || 248}</div>
        <div className="card-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 17l5-5 5 5" />
          </svg>
          32% vs ayer
        </div>
        <div className="spark">
          <svg viewBox="0 0 100 24" preserveAspectRatio="none">
            <path
              d="M0,18 C8,15 12,12 20,13 C28,14 32,10 40,11 C48,12 52,7 60,8 C68,9 72,5 80,6 C88,7 92,3 100,4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M0,18 C8,15 12,12 20,13 C28,14 32,10 40,11 C48,12 52,7 60,8 C68,9 72,5 80,6 C88,7 92,3 100,4 L100,24 L0,24 Z"
              fill="url(#sg)"
              opacity="0.28"
            />
            <defs>
              <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.6" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Agentes activos */}
      <div className="card">
        <div className="card-label">Agentes activos</div>
        <div className="card-metric num">{activeAgents || 4}</div>
        <div className="card-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          {activeAgents || 3} respondiendo · 1 calificando
        </div>
      </div>

      {/* Standing goals */}
      <div className="card">
        <div className="card-label">Standing goals</div>
        <div className="card-metric num">
          <span style={{ color: 'var(--os-ok)' }}>{okGoals || 5}</span>
          <span className="sep">/</span>
          <span style={{ color: 'var(--os-err)' }} className="small">
            {breachGoals || 1}
          </span>
        </div>
        {breachGoals > 0 ? (
          <div className="card-hint err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            {breachGoals} breach: SLA de respuesta &gt; 5min
          </div>
        ) : (
          <div className="card-hint ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Todos los goals en verde
          </div>
        )}
      </div>
    </section>
  );
}
