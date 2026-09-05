import type { Agent, Connector, Goal } from '@/lib/os/repository';

interface HealthMeterProps {
  connectors: Connector[];
  agents: Agent[];
  goals: Goal[];
}

/**
 * Composite health score 0-100 built from three real sub-scores:
 *   - Connector liveness (% of connectors in 'live' state)
 *   - Agent activity   (% of agents in 'active' state)
 *   - Goal compliance  (% of goals with lastStatus === 'ok')
 * Weighted 40/30/30 — bumps connectors slightly higher since a dead pipe
 * silently kills everything downstream.
 */
export function computeHealthScore(agents: Agent[], connectors: Connector[], goals: Goal[]): number {
  const connectorScore = connectors.length === 0
    ? 100
    : (connectors.filter((c) => c.status === 'live').length / connectors.length) * 100;
  const agentScore = agents.length === 0
    ? 100
    : (agents.filter((a) => a.status === 'active').length / agents.length) * 100;
  const goalScore = goals.length === 0
    ? 100
    : (goals.filter((g) => g.lastStatus === 'ok').length / goals.length) * 100;
  return Math.round(connectorScore * 0.4 + agentScore * 0.3 + goalScore * 0.3);
}

export function HealthMeter({ connectors, agents, goals }: HealthMeterProps) {
  const score = computeHealthScore(agents, connectors, goals);
  const label =
    score >= 85 ? 'Excelente' :
    score >= 70 ? 'Saludable' :
    score >= 50 ? 'Aceptable' :
    score >= 25 ? 'Degradado' :
    'Crítico';
  const color =
    score >= 70 ? 'var(--os-ok, #46d38a)' :
    score >= 40 ? 'var(--os-warn, #f0b24a)' :
    'var(--os-err, #f45b69)';

  const w = 220;
  const h = 12;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-os-border bg-os-surface p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
            Salud del sistema
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-semibold tracking-tight" style={{ color }}>
              {score}
            </span>
            <span className="font-mono text-[11px] text-os-dim">/ 100</span>
          </div>
        </div>
        <span
          className="rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
          style={{ color, borderColor: color, backgroundColor: `${color}15` }}
        >
          {label}
        </span>
      </div>

      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full" aria-hidden="true">
        <rect x="0" y="0" width={w} height={h} rx={h / 2} fill="var(--os-border, #333)" opacity="0.35" />
        <rect x="0" y="0" width={(w * pct).toFixed(1)} height={h} rx={h / 2} fill={color} />
      </svg>

      <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[10.5px]">
        <div>
          <div className="text-os-dim">Conectores</div>
          <div className="text-os-muted">
            {connectors.filter((c) => c.status === 'live').length}/{connectors.length || '—'}
          </div>
        </div>
        <div>
          <div className="text-os-dim">Agentes</div>
          <div className="text-os-muted">
            {agents.filter((a) => a.status === 'active').length}/{agents.length || '—'}
          </div>
        </div>
        <div>
          <div className="text-os-dim">Goals</div>
          <div className="text-os-muted">
            {goals.filter((g) => g.lastStatus === 'ok').length}/{goals.length || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
