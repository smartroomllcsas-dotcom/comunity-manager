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
  const rows = goals;

  return (
    <section>
      <div className="section-head">
        <div className="section-title">Objetivos permanentes</div>
        <div className="section-meta">verificados cada 15 min</div>
      </div>
      <div className="goals-grid">
        {rows.length === 0 && (
          <div className="goal unknown">
            <div className="goal-title">Sin goals definidos</div>
            <div className="goal-pred">define objetivos verificables en /os/goals</div>
          </div>
        )}
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
