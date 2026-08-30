const PHASES = [
  {
    quarter: 'Q3 2026',
    status: 'in_progress',
    label: 'Fusión Community OS × FounderOS',
    items: [
      { title: 'Shell unificado (sidebar + topbar + command palette)', done: true },
      { title: 'Agentes, Goals, Skills, Funnel, Workflows', done: true },
      { title: 'Comms unificado (WA + Messenger + IG + Email + Slack)', done: false },
      { title: 'Task board alimentado por agentes', done: false },
    ],
  },
  {
    quarter: 'Q4 2026',
    status: 'planned',
    label: 'Multi-marca y personas',
    items: [
      { title: 'Personas: templates de OS por vertical', done: false },
      { title: 'Brain shared knowledge por marca', done: false },
      { title: 'Analytics cross-brand con roll-ups', done: false },
    ],
  },
  {
    quarter: 'Q1 2027',
    status: 'planned',
    label: 'Automation deep',
    items: [
      { title: 'Workflow builder visual (drag-drop nodes)', done: false },
      { title: 'Conductor pattern: agente supervisor de agentes', done: false },
      { title: 'Marketplace de skills públicas', done: false },
    ],
  },
];

export default function OsRoadmapPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Roadmap</h1>
          <div className="page-sub">Fases y quarters — visibilidad pública de qué está en curso</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {PHASES.map((phase) => (
          <section
            key={phase.quarter}
            className="rounded-xl border p-5"
            style={{
              borderColor: 'var(--border)',
              background:
                phase.status === 'in_progress'
                  ? 'linear-gradient(180deg, color-mix(in oklch, var(--os-accent) 8%, transparent), var(--surface-2))'
                  : 'var(--surface-2)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                style={
                  phase.status === 'in_progress'
                    ? { background: 'color-mix(in oklch, var(--os-accent) 25%, transparent)', color: 'oklch(85% 0.14 250)' }
                    : { background: 'var(--surface-3, #1f2937)', color: 'var(--text-2)' }
                }
              >
                {phase.quarter}
              </div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
                {phase.label}
              </h2>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {phase.items.map((item) => (
                <li key={item.title} className="flex items-center gap-3 text-sm">
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full"
                    style={
                      item.done
                        ? { background: 'var(--os-ok)', color: 'white' }
                        : { border: '1.5px solid var(--border)' }
                    }
                  >
                    {item.done && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="h-2.5 w-2.5">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </span>
                  <span style={{ color: item.done ? 'var(--text-2)' : 'var(--text-1)', textDecoration: item.done ? 'line-through' : 'none' }}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
