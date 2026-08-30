import Link from 'next/link';
import { Crown, Star, Users } from 'lucide-react';

const HIERARCHY = [
  {
    role: 'Operator',
    icon: Crown,
    accent: 'var(--os-warn)',
    person: 'Leonel',
    scope: 'Decisiones estratégicas · goals top-level · política',
  },
  {
    role: 'Conductor',
    icon: Star,
    accent: 'var(--os-accent)',
    person: 'Auto-responder (agente)',
    scope: 'Coordina agentes · asigna tareas · escala a humano',
  },
  {
    role: 'Pilares',
    icon: Users,
    accent: 'oklch(65% 0.13 145)',
    person: '4 pilares activos',
    scope: 'Bandeja · Contenido · Datos · Comercial',
  },
];

const WORKERS = [
  { name: 'Auto-responder', pillar: 'Bandeja', status: 'live', trust: 0.92 },
  { name: 'Lead-qualifier', pillar: 'Comercial', status: 'live', trust: 0.88 },
  { name: 'Content-writer', pillar: 'Contenido', status: 'live', trust: 0.76 },
  { name: 'Escalator-agent', pillar: 'Bandeja', status: 'idle', trust: 0.7 },
];

export default function OsOrgPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Organización</h1>
          <div className="page-sub">
            Jerarquía operator → conductor → pilares → agentes trabajadores
          </div>
        </div>
      </div>

      {/* Hierarchy chain */}
      <div className="mt-4 flex flex-col gap-3">
        {HIERARCHY.map((level, idx) => (
          <div key={level.role} className="relative">
            {idx > 0 && (
              <div
                className="absolute left-8 -top-3 h-3 w-px"
                style={{ background: 'var(--border)' }}
              />
            )}
            <div
              className="flex items-center gap-4 rounded-xl border p-4"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: `${level.accent} / 0.12`, color: level.accent }}
              >
                <level.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: `${level.accent} / 0.15`, color: level.accent }}
                  >
                    {level.role}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                    {level.person}
                  </span>
                </div>
                <div className="mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
                  {level.scope}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Workers roster */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>
          Agentes trabajadores
        </h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {WORKERS.map((w) => (
            <div
              key={w.name}
              className="flex items-center justify-between rounded-lg border p-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {w.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                  {w.pillar} · trust {w.trust.toFixed(2)}
                </div>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={
                  w.status === 'live'
                    ? { background: 'oklch(65% 0.13 145 / 0.15)', color: 'oklch(75% 0.13 145)' }
                    : { background: 'var(--surface-3, #1f2937)', color: 'var(--text-2)' }
                }
              >
                {w.status}
              </span>
            </div>
          ))}
        </div>
        <Link
          href="/es/os/agents"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--os-accent)' }}
        >
          Ver roster completo →
        </Link>
      </div>
    </main>
  );
}
