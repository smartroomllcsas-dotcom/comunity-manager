import type { Goal } from '@/lib/os/repository';

interface GoalsGridProps {
  goals: Goal[];
}

function goalClass(status: Goal['lastStatus']): string {
  if (status === 'breach') return 'goal breach';
  if (!status) return 'goal unknown';
  return 'goal';
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function evidenceSummary(goal: Goal): string {
  if (typeof goal.lastEvidence === 'string') return goal.lastEvidence;
  if (goal.lastStatus === 'breach') return 'breach detectado';
  if (goal.lastStatus === 'ok') return 'pass';
  return 'sin datos';
}

function predicateFromSpec(spec: Record<string, unknown>): string {
  if (typeof spec.predicate === 'string') return spec.predicate;
  if (typeof spec.condition === 'string') return spec.condition;
  return JSON.stringify(spec);
}

export function GoalsGrid({ goals }: GoalsGridProps) {
  const rows = goals.length > 0 ? goals : PLACEHOLDER_GOALS;

  return (
    <section>
      <div className="section-head">
        <div className="section-title">Standing goals · sentinel</div>
        <div className="section-meta">verificados cada 15 min · última corrida hace 2 min</div>
      </div>
      <div className="goals-grid">
        {rows.map((goal) => {
          const isBreach = goal.lastStatus === 'breach';
          const checkClass = `goal-check ${isBreach ? 'fail' : 'pass'}`;
          const predicate = predicateFromSpec(goal.spec);
          const evidence = evidenceSummary(goal);

          return (
            <div key={goal.id} className={goalClass(goal.lastStatus)}>
              <div className="goal-title">{goal.title}</div>
              {predicate && <div className="goal-pred">{predicate}</div>}
              <div className={checkClass}>
                {isBreach ? <XIcon /> : <CheckIcon />}
                {evidence}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const PLACEHOLDER_GOALS: Goal[] = [
  { id: '1', orgId: 'demo', title: 'Uptime canales',       spec: { predicate: "count(channels.status=='live') / total >= 0.99" }, cadence: '15m', lastStatus: 'ok',     lastEvidence: 'pass · 7/7 live',              createdAt: new Date().toISOString() },
  { id: '2', orgId: 'demo', title: 'SLA de respuesta',     spec: { predicate: 'p50(response_time) < 5min AND max < 15min' },      cadence: '15m', lastStatus: 'breach', lastEvidence: 'breach · max = 22 min (3 pendientes)', createdAt: new Date().toISOString() },
  { id: '3', orgId: 'demo', title: 'Budget diario Claude', spec: { predicate: 'sum(agent_runs.cost_usd, today) < $10' },           cadence: '1h',  lastStatus: 'ok',     lastEvidence: 'pass · US$ 2.14 usados',       createdAt: new Date().toISOString() },
  { id: '4', orgId: 'demo', title: 'Leads sin asignar',    spec: { predicate: "count(leads.status=='new' AND age > 30min) == 0" }, cadence: '15m', lastStatus: 'ok',     lastEvidence: 'pass · 0 huérfanos',           createdAt: new Date().toISOString() },
  { id: '5', orgId: 'demo', title: 'Rate limit Meta',      spec: { predicate: 'meta.hits_per_hour < 200' },                        cadence: '1h',  lastStatus: 'ok',     lastEvidence: 'pass · 43 hits última hora',   createdAt: new Date().toISOString() },
  { id: '6', orgId: 'demo', title: 'Trust ledger promedio', spec: { predicate: 'avg(agents.trust_score) >= 0.75' },                cadence: '1h',  lastStatus: 'ok',     lastEvidence: 'pass · avg 0.82',              createdAt: new Date().toISOString() },
];
